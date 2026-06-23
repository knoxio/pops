#!/usr/bin/env bash
#
# EX-1 driver — declared-deps completeness across the changed units (or all).
#
# Used by `isolation:check` as the fast per-PR phantom-dep gate. By default it
# limits work to units touched relative to the merge base with origin/main; pass
# --all to sweep every unit (what nightly / a fresh-checkout CI run should do).
#
# Usage:
#   scripts/extractability/check-changed-units.sh           # changed units vs origin/main
#   scripts/extractability/check-changed-units.sh --all     # every unit
#   scripts/extractability/check-changed-units.sh --base <ref>
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

mode="changed"
base="origin/main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) mode="all"; shift ;;
    --base) base="${2:?--base needs a ref}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ "$mode" == "all" ]]; then
  exec node "$repo_root/scripts/extractability/depcheck.mjs" --all
fi

# Resolve a comparison point. If the base ref or a merge-base is unavailable
# (shallow clone, detached CI checkout), fall back to a full sweep — never skip
# the gate silently.
merge_base=""
if git rev-parse --verify --quiet "$base" >/dev/null 2>&1; then
  merge_base="$(git merge-base HEAD "$base" 2>/dev/null || true)"
fi

if [[ -z "$merge_base" ]]; then
  echo "check-changed-units: no merge-base with '$base' (shallow/unfetched) — sweeping all units." >&2
  exec node "$repo_root/scripts/extractability/depcheck.mjs" --all
fi

# Map every changed file to the nearest enclosing unit directory (one holding a
# package.json), restricted to libs/ and pillars/.
mapfile -t changed < <(git diff --name-only "$merge_base"...HEAD -- libs pillars 2>/dev/null || true)

declare -A units=()
for file in "${changed[@]}"; do
  dir="$(dirname "$file")"
  while [[ "$dir" == libs/* || "$dir" == pillars/* || "$dir" == "libs" || "$dir" == "pillars" ]]; do
    if [[ -f "$repo_root/$dir/package.json" ]]; then
      units["$dir"]=1
      break
    fi
    parent="$(dirname "$dir")"
    [[ "$parent" == "$dir" ]] && break
    dir="$parent"
  done
done

if [[ ${#units[@]} -eq 0 ]]; then
  echo "✔ EX-1: no changed JS/TS units vs $base — nothing to check." >&2
  exit 0
fi

# Single invocation across all changed units (depcheck reports per-unit).
node "$repo_root/scripts/extractability/depcheck.mjs" "${!units[@]}"
