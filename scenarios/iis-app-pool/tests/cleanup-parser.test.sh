#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLEANUP="$ROOT/scripts/cleanup.sh"

if [[ ! -x "$CLEANUP" ]]; then
  echo "cleanup script must exist and be executable: $CLEANUP" >&2
  exit 1
fi

help_output="$("$CLEANUP" --help)"
grep -Fq -- '--yes' <<<"$help_output"

dry_run_output="$("$CLEANUP" --dry-run)"
grep -Fq "rg-srelabiisapppool" <<<"$dry_run_output"
grep -Fq "Dry run: would delete resource group" <<<"$dry_run_output"

FIXTURE="$ROOT/output/.cleanup-fixture-$$"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/bin"

cat > "$FIXTURE/bin/az" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FIXTURE/az-arguments.log"
EOF
chmod +x "$FIXTURE/bin/az"

export FIXTURE
PATH="$FIXTURE/bin:$PATH" "$CLEANUP" --resource-group rg-parser --yes >/dev/null

grep -Fq 'group show --name rg-parser' "$FIXTURE/az-arguments.log"
grep -Fq 'group delete --name rg-parser --yes --no-wait' "$FIXTURE/az-arguments.log"

echo "cleanup parser regression checks passed"
