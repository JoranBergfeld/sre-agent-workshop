param(
    [string]$ResourceGroup = "rg-srelabretirement",
    [string]$Workload = "srelabretirement"
)

$vnetName = "$Workload-vnet"
$subnetName = "$Workload-subnet"
$adminUser = "azureuser"
$adminPassword = "Sre" + ([guid]::NewGuid().ToString("N").Substring(0, 16)) + "#Aa9"

function Invoke-Az {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AzArguments)

    $output = & az @AzArguments
    if ($LASTEXITCODE -ne 0) {
        throw "az $($AzArguments -join ' ') failed with exit code $LASTEXITCODE."
    }
    return $output
}

$location = Invoke-Az group show --name $ResourceGroup --query location -o tsv

$legacyVms = @(
    @{ Name = "$Workload-legacy-01"; Size = "Standard_DS1_v2"; Tags = @("env=prod", "app=billing-legacy", "owner=unknown") },
    @{ Name = "$Workload-legacy-02"; Size = "Standard_DS2_v2"; Tags = @("env=test", "app=reporting-legacy") },
    @{ Name = "$Workload-legacy-03"; Size = "Standard_DS1_v2"; Tags = @("env=prod", "app=batch-legacy", "owner=unknown") }
)

foreach ($vm in $legacyVms) {
    az vm show --resource-group $ResourceGroup --name $vm.Name 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Resetting $($vm.Name) to retiring size $($vm.Size) ..."
        Invoke-Az vm resize --resource-group $ResourceGroup --name $vm.Name --size $vm.Size --only-show-errors | Out-Null
    } else {
        Write-Host "Creating legacy VM $($vm.Name) ($($vm.Size)) ..."
        az network nic show --resource-group $ResourceGroup --name "$($vm.Name)-nic" 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Invoke-Az network nic create --resource-group $ResourceGroup --name "$($vm.Name)-nic" `
                --vnet-name $vnetName --subnet $subnetName --only-show-errors | Out-Null
        }
        Invoke-Az vm create `
            --resource-group $ResourceGroup `
            --name $vm.Name `
            --image Ubuntu2204 `
            --size $vm.Size `
            --nics "$($vm.Name)-nic" `
            --storage-sku StandardSSD_LRS `
            --admin-username $adminUser `
            --admin-password $adminPassword `
            --authentication-type password `
            --tags $vm.Tags scenario=vm-size-retirement `
            --only-show-errors --no-wait | Out-Null
    }
}

foreach ($vm in $legacyVms) {
    Invoke-Az vm wait --resource-group $ResourceGroup --name $vm.Name --created --only-show-errors | Out-Null
    Invoke-Az vm deallocate --resource-group $ResourceGroup --name $vm.Name --no-wait --only-show-errors | Out-Null
}

$subscriptionId = Invoke-Az account show --query id -o tsv
$eventTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$advisory = @"
{
  "eventSource": "ServiceHealth",
  "category": "ServiceHealth",
  "level": "Warning",
  "operationName": "Microsoft.ServiceHealth/healthadvisory/action",
  "eventTimestamp": "$eventTimestamp",
  "properties": {
    "title": "Action required: migrate off retiring Dv2/DSv2-series virtual machine sizes",
    "service": "Virtual Machines",
    "region": "$location",
    "incidentType": "ActionRequired",
    "trackingId": "0BNF-9X8",
    "impactedService": "Virtual Machines",
    "impactedSizes": "Standard_DS1_v2 / Standard_DS2_v2 (DSv2-series)",
    "retirementDate": "2027-05-31",
    "subscriptionId": "$subscriptionId",
    "communication": "The Dv2/DSv2-series VM sizes are being retired on 2027-05-31. Identify all virtual machines in your control on these sizes and resize them to a current series (for example Standard_D2s_v5) before the retirement date to avoid service disruption."
  }
}
"@

Write-Host ""
Write-Host "================================================================"
Write-Host "Simulated Azure Service Health advisory — paste into the SRE Agent:"
Write-Host "================================================================"
Write-Host $advisory
Write-Host "================================================================"
Write-Host "Legacy VMs planted in ${ResourceGroup}: $Workload-legacy-01, $Workload-legacy-02, $Workload-legacy-03"
