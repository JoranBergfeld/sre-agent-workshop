#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$SCRIPT_DIR/scenario-tools"
[ -d "$TOOLS_DIR/node_modules" ] || (cd "$TOOLS_DIR" && npm install --silent)
if [ "${1:-}" = "--write" ]; then
  node "$TOOLS_DIR/bin/generate.js"
  node "$TOOLS_DIR/bin/generate-legacy.js"
fi
node "$TOOLS_DIR/bin/validate.js"
node "$TOOLS_DIR/bin/validate-legacy.js"
