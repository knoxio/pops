# US-01: Narrow PR triggers on every `*-quality.yml`

> PRD: [ci-path-filter-audit](README.md)

## Description

As a contributor, I want a PR that touches only one pillar's surface to fire only that pillar's quality workflow, so that docs-only PRs hit ≤ 4 required checks and single-pillar PRs hit ≤ 6.

## Acceptance Criteria

- [x] Every `*-quality.yml` workflow under `.github/workflows/` (except `quality.yml`) replaces its `pull_request: paths-ignore: docs/**, **/*.md` with an explicit `pull_request: paths:` allowlist.
- [x] The PR allowlist mirrors the `push: branches: [main]` allowlist on the same workflow.
- [x] Every filter includes the workflow file itself (`.github/workflows/<name>.yml`) and, for reusable callers, `.github/workflows/_pkg-check.yml`.
- [x] The job-level `Detect changes` step using `dorny/paths-filter` is left in place — it still gates work on `main` pushes.

## Notes

- The trigger-level filter is the load-bearing change: it stops the runner from spinning up at all. The job-level filter only ever helped skip work; the runner cost (~5-15s) was paid regardless.
- Don't add `pnpm-lock.yaml` or `turbo.json` to per-pillar quality filters — they're workspace-wide and would re-broaden the surface.
