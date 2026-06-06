#!/usr/bin/env bash
# Compute next release from conventional commits since the last v* tag.
#
# Writes three things on success:
#   - prepends a section to CHANGELOG.md
#   - writes release-notes.md (used by `gh release create --notes-file`)
#   - emits version / previous / release outputs on $GITHUB_OUTPUT
#
# Bump rules (pre-1.0 follows release-please's "bump-minor-pre-major" preset):
#   - any  BREAKING CHANGE / `type!:` →  major  ; in 0.x, becomes minor
#   - any  feat                       →  minor
#   - any  fix | perf                 →  patch
#   - everything else                 →  no release

set -euo pipefail

TMPDIR_RELEASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RELEASE"' EXIT
mktemp() { command mktemp "$TMPDIR_RELEASE/XXXXXX"; }

LAST_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1 || true)"
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

if [ ! -f CHANGELOG.md ]; then
  printf '# Changelog\n\n' > CHANGELOG.md
fi
{
  head -1 CHANGELOG.md
  echo
  cat "$NOTES"
  tail -n +3 CHANGELOG.md
} > CHANGELOG.md.new
mv CHANGELOG.md.new CHANGELOG.md

echo "$NEW" > version.txt

cp "$NOTES" release-notes.md
{
  echo "version=$NEW"
  echo "previous=${LAST_TAG:-v0.0.0}"
  echo "release=true"
} >> "$GITHUB_OUTPUT"
