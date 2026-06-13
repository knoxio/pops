# US-03: Document the `quality.yml` carve-out

> PRD: [ci-path-filter-audit](README.md)

## Description

As a reviewer, I want `quality.yml`'s deliberate broad filter to be self-explanatory, so that nobody opens a PR-220-style follow-up trying to narrow it.

## Acceptance Criteria

- [x] `quality.yml` keeps `pull_request: paths-ignore: docs/**, **/*.md` and `push: branches: [main]` with the same `paths-ignore`.
- [x] A header comment at the top of `quality.yml` explains: this is the workspace-wide lint / format / module-boundaries gate; it fires on every code change because any code change can break it; it's the carve-out from PRD-220's per-workflow allowlist rule.
- [x] The comment references PRD-220 and PRD-221 (the future affected-rebuild work that will eventually let this workflow narrow too).

## Notes

- The header comment already exists today and partially says this; this US tightens the wording and explicitly references the PRD numbers.
