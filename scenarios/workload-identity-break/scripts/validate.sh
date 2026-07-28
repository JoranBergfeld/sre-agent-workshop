#!/usr/bin/env bash
set -euo pipefail

# Health probe: the app's /items endpoint should return HTTP 200 when the
# workload identity is intact. Exit 0 on 200, non-zero otherwise.
NAMESPACE="workshop"
SERVICE="web-app"

while [ $# -gt 0 ]; do
  case "$1" in
    -s|--service) SERVICE="$2"; shift 2 ;;
    -N|--namespace) NAMESPACE="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [-s|--service <svc>] [-N|--namespace <ns>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

APP_IP=$(kubectl get svc "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -z "$APP_IP" ]; then echo "No external IP yet for svc/$SERVICE" >&2; exit 1; fi

CODE=$(curl -fsS -o /dev/null -w '%{http_code}' "http://$APP_IP/items" || true)
echo "GET http://$APP_IP/items -> $CODE"
if [ "$CODE" = "200" ]; then echo "Healthy: /items returns 200"; exit 0; fi
echo "Degraded: /items did not return 200" >&2
exit 1
