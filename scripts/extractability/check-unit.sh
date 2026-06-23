#!/usr/bin/env bash
#
# EX-1 wrapper — declared-deps completeness for a single unit (fast PR gate).
#
# Asserts every package the unit imports in source is declared in its own
# package.json. This is the cheap proxy for "could it build in its own repo".
#
# Usage:
#   scripts/extractability/check-unit.sh <unit-dir>
#   scripts/extractability/check-unit.sh --self-test
#
# Rust-only units (Cargo.toml, no package.json) are skipped here — they are
# covered by the cargo lane (RUST-*).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" == "--self-test" ]]; then
  exec node "$repo_root/scripts/extractability/depcheck.mjs" --self-test
fi

unit="${1:-}"
if [[ -z "$unit" ]]; then
  echo "usage: check-unit.sh <unit-dir> | --self-test" >&2
  exit 2
fi

unit="${unit%/}"

if [[ ! -d "$repo_root/$unit" && ! -d "$unit" ]]; then
  echo "check-unit: unit directory not found: $unit" >&2
  exit 2
fi

resolved="$unit"
[[ -d "$repo_root/$unit" ]] && resolved="$repo_root/$unit"

if [[ ! -f "$resolved/package.json" ]]; then
  if [[ -f "$resolved/Cargo.toml" ]]; then
    echo "check-unit: $unit is a Rust crate — skipping (handled by the cargo lane)." >&2
    exit 0
  fi
  echo "check-unit: $unit has no package.json — not a JS/TS unit, skipping." >&2
  exit 0
fi

cd "$repo_root"
exec node "$repo_root/scripts/extractability/depcheck.mjs" "$unit"
