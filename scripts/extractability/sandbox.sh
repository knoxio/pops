#!/usr/bin/env bash
#
# EX-2 — true sandbox extraction (the real litmus; nightly / on exports+dep changes).
#
# Copies a unit OUT of the monorepo into a temp dir, replaces its `@pops/*`
# workspace edges with packed tarballs (the only mutation: "where shared deps
# come from"), installs ONLY its declared deps with no workspace path resolution,
# and builds. If it builds with no monorepo around it, it is extraction-ready.
# If it secretly reached behind a contract, the reached file isn't in the packed
# dist and the build fails.
#
# Heavy by design — not a per-push gate. Run nightly or on units touching
# exports/deps.
#
# Usage:
#   scripts/extractability/sandbox.sh <unit-dir>
#   scripts/extractability/sandbox.sh <unit-dir> --keep   # leave the temp dir for inspection
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

unit="${1:-}"
keep="${2:-}"
if [[ -z "$unit" ]]; then
  echo "usage: sandbox.sh <unit-dir> [--keep]" >&2
  exit 2
fi
unit="${unit%/}"

abs_unit="$unit"
[[ -d "$repo_root/$unit" ]] && abs_unit="$repo_root/$unit"

if [[ ! -d "$abs_unit" ]]; then
  echo "sandbox: unit directory not found: $unit" >&2
  exit 2
fi
if [[ ! -f "$abs_unit/package.json" ]]; then
  if [[ -f "$abs_unit/Cargo.toml" ]]; then
    echo "sandbox: $unit is a Rust crate — use cargo-sandbox (RUST-3), not this script." >&2
    exit 0
  fi
  echo "sandbox: $unit has no package.json — nothing to extract." >&2
  exit 0
fi

has_build="$(node -e "const s=require('$abs_unit/package.json').scripts||{}; process.stdout.write(s.build?'1':'')")"
if [[ -z "$has_build" ]]; then
  echo "sandbox: $unit has no build script — nothing to prove, skipping." >&2
  exit 0
fi
has_typecheck="$(node -e "const s=require('$abs_unit/package.json').scripts||{}; process.stdout.write(s.typecheck?'1':'')")"

work="$(mktemp -d "${TMPDIR:-/tmp}/ex2-sandbox.XXXXXX")"
cleanup() { [[ "$keep" == "--keep" ]] || rm -rf "$work"; }
trap cleanup EXIT
echo "sandbox: $unit -> $work" >&2

cd "$repo_root"

# 1) Pack the unit's @pops/* workspace deps into the sandbox (builds each first).
node "$repo_root/scripts/extractability/pack-deps.mjs" "$unit" "$work/.deps" >"$work/deps-manifest.json"

# 2) Copy the unit verbatim (no node_modules / dist / build / lockfiles).
mkdir -p "$work/u"
rsync -a \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'build' \
  --exclude '.turbo' \
  --exclude 'pnpm-lock.yaml' \
  "$abs_unit/" "$work/u/"

# 3) Rewrite workspace edges -> file: tarballs (the only mutation).
node "$repo_root/scripts/extractability/rewrite-deps.mjs" "$work/u/package.json" "$work/deps-manifest.json"

# 3b) Make the unit's tsconfig self-contained: inline any repo-root `extends`
#     base that won't exist outside the monorepo (no setting is changed, the
#     resolved values are just frozen — exactly what an extracted repo carries).
node "$repo_root/scripts/extractability/materialize-tsconfig.mjs" "$work/u" "$abs_unit"

# 4) Install + build with NO workspace resolution — the proof.
cd "$work/u"
echo "sandbox: installing (isolated, --ignore-workspace) …" >&2
pnpm install --ignore-workspace --no-frozen-lockfile

echo "sandbox: building …" >&2
pnpm run build

if [[ -n "$has_typecheck" ]]; then
  echo "sandbox: typecheck …" >&2
  pnpm run typecheck
fi

echo "✔ EX-2: $unit builds in isolation." >&2
