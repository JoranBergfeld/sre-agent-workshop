# Scenario: Red Button 500

> Track: `appservice` · Scenario id: `red-button-500`

## What breaks

Describe the fault and the symptom an attendee will observe.

## Inject the fault

```bash
./inject.sh    # bash / Linux
```
```powershell
./inject.ps1   # PowerShell / Windows
```

## Validate impact

```bash
./validate.sh
```

## Let the SRE Agent remediate

Explain what alert fires (`red-button-500-alert`) and how the agent is expected
to investigate (see `query.kql`) and remediate (open an issue / PR).

## Manual remediation (facilitator fallback)

```bash
./remediate.sh
```
