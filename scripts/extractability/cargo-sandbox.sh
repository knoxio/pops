#!/usr/bin/env bash
# cargo-sandbox — the Rust analogue of the TS EX-2 sandbox extraction
# (docs/plans/repo-federation/04-isolation-enforcement.md §8, RUST-3).
#
# Proves a workspace member crate builds ALONE, with no workspace path
# resolution: it is copied out, every `{ workspace = true }` dep and every
# `[workspace.package]` inheritance is materialized inline (by cargo-extract.mjs
# — the "changing only where shared deps come from" mutation), and the result is
# `cargo build`-ed in isolation. If it builds, the crate is extraction-ready.
#
# Heavy by design (cold registry fetch + full compile per crate) — this is the
# NIGHTLY / on-demand check, NOT a per-PR gate. The fast per-PR boundary gate is
# `cargo deny check` + `check-cargo-deps.mjs`.
#
# Usage:
#   scripts/extractability/cargo-sandbox.sh <member-dir> [out-dir]
#   scripts/extractability/cargo-sandbox.sh libs/pops-ai
#
# Exit 0 = the crate built in isolation. Non-zero = it reached behind the
# workspace and cannot stand alone.
set -euo pipefail

crate="${1:-}"
if [ -z "$crate" ]; then
  echo "usage: $0 <member-dir> [out-dir]" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${2:-$(mktemp -d "${TMPDIR:-/tmp}/cargo-sandbox.XXXXXX")}"

echo "==> extracting $crate -> $out"
node "$script_dir/cargo-extract.mjs" "$crate" "$out"

echo "==> building $crate in isolation (no workspace path resolution)"
# A fresh CARGO_HOME would re-download the whole index; reuse the caller's
# registry cache for speed but keep target/ local to the sandbox so the build is
# genuinely isolated from the workspace target dir.
(
  cd "$out"
  CARGO_TARGET_DIR="$out/target" cargo build --all-targets
)

echo "==> OK: $crate builds standalone — extraction-ready"
