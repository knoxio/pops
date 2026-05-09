# US-03: Baseline and CI integration

> PRD: [Module Import Boundaries](README.md)
> Status: In progress

## Description

As a maintainer, I want existing violations baselined and the rule wired into CI so that the boundary stops degrading even before each violation is fixed.

## Acceptance Criteria

- [ ] `.dependency-cruiser-known-violations.json` (dependency-cruiser's standard baseline format) captures every existing violation discovered at PRD-097 land time.
- [ ] The baseline is consumed by passing `--ignore-known` to `depcruise` in the `pnpm lint:boundaries` script, so baselined entries do not fail the lint.
- [ ] A `boundaries` job is added to `.github/workflows/quality.yml` that runs `pnpm lint:boundaries` and blocks merge on failure.
- [ ] Each baselined violation has a tracking issue filed (title format: `gap(PRD-097): <module-or-app> imports from <peer> — <file>` or similar).
- [ ] Tracking issues are referenced from the PR that lands PRD-097 in the `## Gaps (tracked)` section.
- [ ] Introducing a new violation (e.g. by editing a file to add a forbidden import) makes `pnpm lint:boundaries` fail locally.

## Notes

- Use `dependency-cruiser`'s `--ignore-known` / known-violations file pattern (or equivalent rule-skip mechanism) — do not silence rules entirely.
- The list of current violations is in the PRD README. Verify by re-running the scan before generating the baseline; do not hand-author entries.
- New violations are caught on first push to a PR branch; CI must run on `pull_request` (not just `push: main`).
