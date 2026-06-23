#!/usr/bin/env bash
#
# EX-3 — baseline monotonicity guard (every PR, instant).
#
# The dep-cruiser known-violations baseline (.dependency-cruiser-known-violations.json)
# grandfathers pre-existing boundary violations during the federation migration.
# It may only ever SHRINK. A PR that grows it is adding a new grandfathered
# violation — forbidden. This guard fails iff the working-tree baseline has more
# entries than the base (origin/main) baseline.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

baseline_file=".dependency-cruiser-known-violations.json"
base_ref="${BASELINE_BASE_REF:-origin/main}"

if [[ ! -f "$baseline_file" ]]; then
  echo "baseline-guard: $baseline_file missing in working tree" >&2
  exit 2
fi

# Materialise the base-ref baseline. Fetch the ref if it isn't present (shallow
# CI checkouts). If the file did not exist at the base (older history), treat it
# as an empty baseline — any working-tree entries would then be a growth and
# correctly fail, which is the safe direction.
if ! git rev-parse --verify --quiet "$base_ref" >/dev/null 2>&1; then
  git fetch --quiet --depth=1 origin "${base_ref#origin/}" 2>/dev/null || true
fi

base_json="$(mktemp)"
trap 'rm -f "$base_json"' EXIT

if git rev-parse --verify --quiet "$base_ref" >/dev/null 2>&1 &&
  git cat-file -e "$base_ref:$baseline_file" 2>/dev/null; then
  git show "$base_ref:$baseline_file" >"$base_json"
else
  echo "baseline-guard: no baseline at $base_ref — treating base as empty []." >&2
  echo "[]" >"$base_json"
fi

BASELINE_GUARD_BASE="$base_json" BASELINE_GUARD_HEAD="$baseline_file" node -e '
  const fs = require("node:fs");
  const load = (p, label) => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.error(`baseline-guard: ${label} is not valid JSON (${e.message})`);
      process.exit(2);
    }
    if (!Array.isArray(data)) {
      console.error(`baseline-guard: ${label} is not a JSON array`);
      process.exit(2);
    }
    return data;
  };
  const base = load(process.env.BASELINE_GUARD_BASE, "base baseline");
  const head = load(process.env.BASELINE_GUARD_HEAD, "working-tree baseline");
  if (head.length > base.length) {
    console.error(
      `✗ EX-3: known-violations baseline grew ${base.length} -> ${head.length}. ` +
        `No new grandfathered boundary violations allowed — fix the violation instead of baselining it.`,
    );
    process.exit(1);
  }
  const delta = base.length - head.length;
  const trend = delta > 0 ? ` (shrank by ${delta})` : " (unchanged)";
  console.log(`✔ EX-3: baseline ${base.length} -> ${head.length}${trend}.`);
'
