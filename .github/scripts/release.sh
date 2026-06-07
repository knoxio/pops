#!/usr/bin/env bash
# Compute next release from conventional commits since the last vX.Y.Z tag.
#
# Writes two things on success (the workflow handles tagging + GitHub Release):
#   - writes release-notes.md (used by `gh release create --notes-file`)
#   - emits version / previous / release outputs on $GITHUB_OUTPUT
#
# Deliberately does NOT mutate CHANGELOG.md or version.txt in the working tree:
# the repo ruleset requires changes to main to go through a PR, so the workflow
# can't push a release commit directly. The GitHub Release is the source of
# truth for changelog history.
#
# Bump rules (pre-1.0 collapses major into minor, like release-please's
# "bump-minor-pre-major" preset):
#   - any  BREAKING CHANGE / BREAKING-CHANGE / `type!:` →  major  ; in 0.x, becomes minor
#   - any  feat                                         →  minor
#   - any  fix | perf                                   →  patch
#   - everything else                                   →  no release

set -euo pipefail

TMPDIR_RELEASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RELEASE"' EXIT
mktemp() { command mktemp "$TMPDIR_RELEASE/XXXXXX"; }

# Filter to strict vMAJOR.MINOR.PATCH so legacy rolling tags (v1, v2, …) and
# pre-release / 4-segment variants (v1.2.3-rc.1, v1.2.3.4) don't get picked
# up as the previous release. `git tag -l` uses globs which can't express
# "anchored regex" — pipe through grep -E instead.
LAST_TAG="$(git tag -l --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
if [ -n "$LAST_TAG" ]; then
  RANGE="${LAST_TAG}..HEAD"
  CURRENT="${LAST_TAG#v}"
else
  RANGE="HEAD"
  CURRENT="0.0.0"
fi

SUBJECTS="$(mktemp)"
BODIES="$(mktemp)"
git log --pretty='format:%s' "$RANGE" > "$SUBJECTS"
git log --pretty='format:%B%x1e'   "$RANGE" > "$BODIES"

BUMP=""
# Conventional Commits allows both "BREAKING CHANGE:" and "BREAKING-CHANGE:" footers.
if grep -qE 'BREAKING[ -]CHANGE'             "$BODIES"   ||
   grep -qE '^[a-z]+(\([^)]+\))?!:'          "$SUBJECTS"; then
  BUMP="major"
elif grep -qE '^feat(\(|:)'                  "$SUBJECTS"; then
  BUMP="minor"
elif grep -qE '^(fix|perf)(\(|:)'            "$SUBJECTS"; then
  BUMP="patch"
fi

if [ -z "$BUMP" ]; then
  echo "No releasable commits since ${LAST_TAG:-init}"
  echo "release=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
if [ "$MAJ" -eq 0 ]; then
  # Pre-1.0: collapse major → minor so breaking changes don't ship as 1.0 by accident.
  case "$BUMP" in
    major|minor) MIN=$((MIN + 1)); PAT=0 ;;
    patch)       PAT=$((PAT + 1))         ;;
  esac
else
  case "$BUMP" in
    major) MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
    minor) MIN=$((MIN + 1)); PAT=0         ;;
    patch) PAT=$((PAT + 1))                 ;;
  esac
fi
NEW="${MAJ}.${MIN}.${PAT}"

DATE="$(date -u +%F)"
BASE_URL="https://github.com/${GITHUB_REPOSITORY}"
PREV_REF="${LAST_TAG:-$(git rev-list --max-parents=0 HEAD | head -1)}"
NOTES="$(mktemp)"

{
  echo "## [${NEW}](${BASE_URL}/compare/${PREV_REF}...v${NEW}) (${DATE})"
  echo
} > "$NOTES"

emit_section() {
  local type="$1" title="$2" items
  # Strip the `type(scope)?: ` prefix from each subject — the section header
  # already conveys the commit type, and stripping the scope keeps lines short.
  items="$(git log --reverse \
    --pretty="format:* %s§%h§%H" \
    "$RANGE" -E --grep "^${type}(\\([^)]+\\))?!?:" \
    | sed -E "s|^\\* ${type}(\\([^)]+\\))?!?: *|* |" \
    | sed -E "s|§([^§]+)§([^§]+)$| ([\\\`\\1\\\`](${BASE_URL}/commit/\\2))|" \
    || true)"
  if [ -n "$items" ]; then
    {
      echo "### ${title}"
      echo
      printf '%s\n' "$items"
      echo
    } >> "$NOTES"
  fi
}

emit_section feat   "Features"
emit_section fix    "Bug Fixes"
emit_section perf   "Performance"
emit_section revert "Reverts"
emit_section docs   "Documentation"
emit_section build  "Build"
emit_section ci     "CI/CD"

# GitHub Releases caps the body at 125,000 characters. Truncate with a clear
# tail note so the call succeeds even on first-time releases that roll up
# every conventional commit since the initial commit.
MAX_BYTES=120000
if [ "$(wc -c < "$NOTES")" -gt "$MAX_BYTES" ]; then
  head -c "$MAX_BYTES" "$NOTES" > release-notes.md
  printf '\n\n_…notes truncated; see `git log %s..v%s` for the full range._\n' \
    "${LAST_TAG:-$PREV_REF}" "$NEW" >> release-notes.md
else
  cp "$NOTES" release-notes.md
fi
{
  echo "version=$NEW"
  echo "previous=${LAST_TAG:-v0.0.0}"
  echo "release=true"
} >> "$GITHUB_OUTPUT"
