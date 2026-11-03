# Local order-status investigation

## Objectives and boundaries

Observe a slow, otherwise valid synthetic order response; distinguish it from
service unavailability using an independent health route. Correlate request
duration with application-stage events before choosing a hypothesis.

This is the application foundation for `appservice-latency-context`, not Azure
deployment automation. No external API, database, credentials, security fixture,
agent subscription or Azure resources are needed locally. All data is synthetic.
Use **only loopback** for the PHP development server; never expose it publicly.
Stop it after use. A workload makes exactly **one order request and three health
requests**, without retries or load amplification. One faulty order takes roughly
20 seconds; transport/hosting overhead varies. HTTP 5xx or timeout is not the
intended incident.

Prerequisites: Node.js 22+ and PHP 8.3+ CLI on Linux/macOS, or WSL on Windows.
PowerShell examples run in PowerShell on Linux/macOS/WSL. Native Windows PHP's
single-worker development server cannot demonstrate independent health during a
blocked request. Use the same environment for both comparison passes.

## Starting facts

| HTTP interface | Expected content |
| --- | --- |
| `GET /health` | `200`, `{"status":"healthy"}` |
| `GET /api/orders/DEMO-1001` | `200`, `{"orderId":"DEMO-1001","status":"processing","estimatedDelivery":"2026-12-10"}` |
| Other paths / methods | `404` / `405`; no order work |

Both prepared revisions retain the same order payload. A correct repair also
retains the intended brief request-path pause. Returning quickly by removing
behavior is not a repair.

Application events go to stderr (the local runner emits parsed JSON to stdout).
Each response has an `X-Request-ID` matching `request_id` in its events. Compare
`request.started`, `stage.started`, `stage.completed`, and `request.completed`;
completion events carry measured `duration_ms`. Health requests have no order
stage. Logs contain a revision and `prepared_at` timestamp from `deployment.json`.
That timestamp means **local package preparation**, not proven Azure deployment.
Later deployment tooling must capture actual deployment timing separately.
These logs are local evidence, not automatically Application Insights telemetry.

## Run and observe

Start healthy, observe one bounded workload, then stop the server. Prepare the
faulty revision and repeat **the same workload**. Observe whether health remains
responsive while the order is pending. Save terminal output and request IDs
before resetting. What evidence supports application work rather than a failed
downstream service? Try narrowing logs to one request ID, then compare the small
unrelated health sample. More traffic is unnecessary.

<details>
<summary>Show exact steps</summary>

From the repository root, enter `scenarios/appservice-latency-context`.
Check tools with `node --version` and `php --version`. If PHP is installed under
another path, set `PHP_BIN` to that executable (Bash:
`export PHP_BIN=/absolute/path/to/php`; PowerShell:
`$env:PHP_BIN = '/absolute/path/to/php'`). The runner does not install tools.

**Bash, terminal 1:**

```bash
cd scenarios/appservice-latency-context
app=$(node scripts/local.mjs prepare healthy)
printf '%s\n' "$app"
node scripts/local.mjs serve "$app"
```

**PowerShell, terminal 1:**

```powershell
Set-Location scenarios/appservice-latency-context
$app = node scripts/local.mjs prepare healthy
$app
node scripts/local.mjs serve "$app"
```

**Either shell, terminal 2**, from the capsule directory:

```text
node scripts/workload.mjs http://127.0.0.1:8080
```

The workload prints four JSON observations: status, content, elapsed milliseconds
and correlation ID. Server readiness adds one health request outside the measured
workload. Healthy order work is brief; health is fast.

Stop terminal 1 with **Ctrl+C**. Prepare `faulty` instead of `healthy` using the
same commands, then serve that new directory and run the identical workload.
The three health observations should arrive while the one order is pending;
the order still returns its valid `200` content after roughly 20 seconds.
The runner uses four PHP CLI workers to avoid a single-worker artifact.

The server binds `127.0.0.1:8080`. Workload accepts only loopback HTTP URLs.
Neither command repeats automatically. Retain the emitted package paths.

</details>

## Repair validation, reset and equivalent passes

The HTTP repair test checks the payload and a controlled, nonzero timing range
at both response and correlated stage boundaries. Removing the pause fails it.
The full suite also executes **one real slow request** while checking health
concurrently, and a no-pause mutation proves the repair gate rejects that shortcut.
No clock or PHP timing function is mocked. The local bounds allow scheduler
jitter; they are not an App Service SLO or a guarantee of subsecond hosted latency.

For comparison, prepare a **fresh faulty directory for each pass** at the same
source commit. Reuse the workload, PHP version, worker count and machine
conditions; record unavoidable differences. Preserve code changes, request logs,
revision IDs, timestamps and measurements before resetting. Recreating a healthy
package is a **reset**, not evidence of code repair or deployed runtime recovery.

<details>
<summary>Show exact steps</summary>

From the capsule directory, either shell:

```text
node --test tests/http.test.mjs
```

Expected: four passing tests, about 20 seconds plus startup overhead.
To test an edited prepared package, use its printed absolute path:

**Bash:**

```bash
APP_DIR="$app" node --test --test-name-pattern '^repair preserves' tests/http.test.mjs
```

**PowerShell:**

```powershell
$env:APP_DIR = $app
node --test --test-name-pattern '^repair preserves' tests/http.test.mjs
Remove-Item Env:APP_DIR
```

This test fails for an unchanged faulty package and for a candidate with its
pause removed. It should pass for a behavior-preserving repair. It tests HTTP,
not the helper's source layout. Leave the prepared fault fixture unchanged.

Stop the server before reset. Create a fresh package with `prepare healthy` or
`prepare faulty`; do not overwrite a directory holding a candidate repair.
Prepared directories remain under `.local/` so evidence is not silently discarded.
After preserving evidence, remove **only the exact printed directory**:

**Bash:** `rm -r -- "$app"`

**PowerShell:** `Remove-Item -LiteralPath $app -Recurse`

Automatic test-owned packages are cleaned up by the tests. Tests against your
`APP_DIR` never remove that directory. Nothing here resets Git or deletes shared
Azure resources.

</details>

## Troubleshooting and further experiments

- **PHP missing:** run `php --version`; install a PHP CLI through your operating
  system's supported package manager, or set `PHP_BIN`. No Composer packages are
  required. Do not assume administrator privileges.
- **Port occupied:** stop your earlier local server with Ctrl+C, or use a
  different workspace. Do not terminate an unrelated process.
- **Health also slow:** do not run plain single-worker `php -S` for this exercise.
  Use the runner on Linux/macOS/WSL. Native Windows worker support is absent.
- **Timing assertion fails:** close other heavy local workloads, retain the
  measurements, then rerun the single repair test. Do not weaken the gate to
  accommodate faulty behavior. Extremely contended hosts make timing inconclusive.
- **No logs:** use the runner output or collect PHP stderr; match the response
  ID, not native server access-log lines. Capture the full pending order before
  stopping the server.
- **Only a reset passes:** that does not validate the candidate repair. Run the
  repair gate against the edited candidate directory, not a fresh healthy one.

Experiment with alternate hypotheses or log selection, without increasing the
bounded workload. Local tests do not establish tenant telemetry, AI investigation
quality, security-scan support or deployed recovery.

## Platform suitability

First-party documentation checked **2026-11-03**:

- [Microsoft: PHP App Service quickstart](https://learn.microsoft.com/en-us/azure/app-service/quickstart-php):
  PHP hosting is supported on **App Service Linux**, not Windows. Deployment
  tooling must query available runtime versions rather than assume this local
  version is offered by the target region.
- [GitHub: CodeQL code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning):
  PHP is explicitly unsupported. CodeQL does **not** validate this application;
  no scan or security-review outcome is implied by these HTTP tests.
- [PHP: built-in server](https://www.php.net/manual/en/features.commandline.webserver.php):
  development-only, single-worker by default; CLI worker mode requires a
  non-Windows platform. App Service must use its production PHP hosting stack,
  not this development runner.

<details>
<summary>Spoiler: root cause and reference repair</summary>

The intended pause is **20 milliseconds**. The healthy helper calls
`usleep($milliseconds * 1000)`. The prepared faulty helper calls
`sleep($milliseconds)` with the value 20, interpreting that value as seconds.
A repair restores unit conversion and preserves the 20 ms pause and payload;
deleting the pause, changing the workload, or selecting the healthy package is
not the code repair.

The reference behavior is in `src/timing.php`; the prepared regression is in
`tests/fixtures/timing-faulty.php`. Those files are code, not telemetry findings.
[PHP `usleep`](https://www.php.net/manual/en/function.usleep.php) takes
microseconds; [PHP `sleep`](https://www.php.net/manual/en/function.sleep.php)
takes seconds (first-party reference, checked 2026-11-03).

</details>
