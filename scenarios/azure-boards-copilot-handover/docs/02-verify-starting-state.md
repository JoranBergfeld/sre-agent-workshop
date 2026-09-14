# Module 2: Verify the healthy v1 path

Before triggering schema drift, prove that the queue, Function, and receipt
store work for the supported v1 contract.

## Open the workshop status

Discover the Function app and retrieve its key without writing the key to
disk:

```bash
RESOURCE_GROUP="srelabboardshandover-rg"
FUNCTION_APP="$(az functionapp list --resource-group "$RESOURCE_GROUP" --query '[0].name' --output tsv)"
FUNCTION_HOSTNAME="$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query defaultHostName --output tsv)"
FUNCTION_KEY="$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query functionKeys.default --output tsv)"
curl -sS "https://$FUNCTION_HOSTNAME/api/status?code=$FUNCTION_KEY" | jq
```

```powershell
$ResourceGroup = "srelabboardshandover-rg"
$FunctionApp = az functionapp list --resource-group $ResourceGroup --query "[0].name" --output tsv
$FunctionHostname = az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv
$FunctionKey = az functionapp keys list --resource-group $ResourceGroup --name $FunctionApp --query functionKeys.default --output tsv
Invoke-RestMethod "https://$FunctionHostname/api/status?code=$FunctionKey" | ConvertTo-Json
```

For a custom workload, use `<workload>-rg`.

The healthy starting state is:

```json
{
  "incidentBatchInjected": false,
  "normalizedReceiptCount": 3,
  "v1ReceiptCount": 3,
  "v2ReceiptCount": 0
}
```

The response also includes deployment provenance. Record the commit SHA, but
never record the Function key.

## Understand the intended failure

The starting normalizer supports valid v1 events. Valid v2 events use evolved
field names and nesting, so the normalizer raises
`UnsupportedReceiptSchemaError`. Those events remain active and recoverable in
Service Bus. They are **unsupported order events**, not invalid order events.

Next: [Onboard the SRE Agent](./03-onboard-sre-agent.md).
