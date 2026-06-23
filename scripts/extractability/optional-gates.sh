#!/usr/bin/env bash
#
# ISO-CMD helper — run the fast isolation guards that already ship as separate
# scripts, gated on existence.
#
# `isolation:check` bundles the always-present gates (lint:boundaries + EX-3 +
# EX-1) directly. The lib-no-pillar-import guard ships under scripts/ci, and the
# exports gate (ISO-EXPORTS / P6-T02) may not be on the tree yet. Both are run
# here guarded by existence so the aggregate stays green today and auto-engages
# the exports gate the moment it lands — no further edit to this command.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

ran=0

# lib-never-imports-a-pillar — complementary to dep-cruiser ISO-R1 (already run
# by lint:boundaries), kept here so the single local gate matches CI.
if [[ -f scripts/ci/check-lib-no-pillar-import.mjs ]]; then
  echo "isolation:check: running check-lib-no-pillar-import.mjs" >&2
  node scripts/ci/check-lib-no-pillar-import.mjs
  ran=1
fi

# exports-map self-consistency (ISO-EXPORTS). Path is checked in both the
# expected root location and scripts/ci to be forward-compatible with wherever
# P6-T02 lands it.
for candidate in scripts/check-exports.mjs scripts/ci/check-exports.mjs; do
  if [[ -f "$candidate" ]]; then
    echo "isolation:check: running $candidate" >&2
    node "$candidate"
    ran=1
    break
  fi
done

if [[ "$ran" -eq 0 ]]; then
  echo "isolation:check: no companion gates present (check-lib-no-pillar-import / check-exports)." >&2
fi
