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
has_typecheck="$(node -e "const s=require('$abs_unit/package.json').scripts||{}; process.stdout.write(s.typecheck?'1':'')")"
has_test="$(node -e "const s=require('$abs_unit/package.json').scripts||{}; process.stdout.write((s['test:coverage']||s.test)?'1':'')")"

# What proof do we owe this unit? Three honest cases — never a silent skip when
# there IS a surface to prove:
#
#   * build present            -> emit-build is the proof (a consumer could
#                                 `tsc -b` against the published .d.ts).
#   * no build, typecheck/test -> a SHELL-BUNDLED app unit (ADR-002): the 7
#                                 `pillars/*/app` React FE fragments have no
#                                 standalone `build` because they are compiled
#                                 into the shell's single Vite SPA, not emitted
#                                 as a library. A standalone bundle is therefore
#                                 meaningless for them. Their extraction proof
#                                 is "installs in isolation against packed
#                                 @pops/* tarballs, then typechecks (+ tests)" —
#                                 which is exactly what this sandbox runs below.
#                                 So we DO prove them; we just skip emit-build.
#                                 (Mirrors app-quality.yml, which type+tests the
#                                 app units but never `pnpm build`s them.)
#   * none of the three        -> genuinely nothing to prove (config/data-only
#                                 package); skip with a reason.
if [[ -z "$has_build" && -z "$has_typecheck" && -z "$has_test" ]]; then
  echo "sandbox: $unit has no build/typecheck/test script — nothing to prove, skipping." >&2
  exit 0
fi
if [[ -z "$has_build" ]]; then
  echo "sandbox: $unit has no build script — shell-bundled app unit (ADR-002); proving extraction via isolated typecheck/test, not a standalone bundle." >&2
fi

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

# 4) Install + prove with NO workspace resolution — the litmus.
#
# Lint is deliberately NOT run here. oxlint/oxfmt and their rule config live
# ONLY at the repo root (by design — no per-unit lint configs; lint stays
# monorepo-only), so an extracted unit cannot lint standalone. Running it in
# this isolated sandbox would either fail (no config) or silently no-op, and
# either way it would NOT be an honest claim of "lint-clean extraction". Lint
# is a monorepo-wide gate (`pnpm lint`), not part of the extraction proof; the
# sandbox proves only what an extracted repo could genuinely run on its own:
# install + build (or typecheck/test for shell-bundled app units).
cd "$work/u"
echo "sandbox: installing (isolated, --ignore-workspace) …" >&2
pnpm install --ignore-workspace --no-frozen-lockfile

if [[ -n "$has_build" ]]; then
  echo "sandbox: building …" >&2
  pnpm run build
fi

if [[ -n "$has_typecheck" ]]; then
  echo "sandbox: typecheck …" >&2
  pnpm run typecheck
fi

# Shell-bundled app units (no build script) prove extraction via their own
# test suite too — it exercises the packed @pops/* contracts at runtime, the
# strongest evidence the unit needs nothing behind a contract. For units that
# DO emit a build, the build + typecheck above is the proof and tests stay in
# the dedicated test lanes (kept out here to keep EX-2 fast).
if [[ -z "$has_build" && -n "$has_test" ]]; then
  echo "sandbox: test (isolated) …" >&2
  if node -e "process.exit((require('./package.json').scripts||{})['test:coverage']?0:1)"; then
    pnpm run test:coverage
  else
    pnpm run test
  fi
fi

if [[ -n "$has_build" ]]; then
  echo "✔ EX-2: $unit builds in isolation." >&2
else
  echo "✔ EX-2: $unit typechecks/tests in isolation (shell-bundled app unit; no standalone build by design)." >&2
fi
