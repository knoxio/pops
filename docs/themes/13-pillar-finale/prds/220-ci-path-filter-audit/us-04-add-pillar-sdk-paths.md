# US-04: Add `pillar-sdk` + per-pillar contract paths to api/fe filters

> PRD: [ci-path-filter-audit](README.md)

## Description

As a contributor, I want a change to `packages/pillar-sdk/**` or `packages/<pillar>-contract/**` to fire the relevant per-pillar quality workflow, so that a contract bump that breaks an api gets caught at PR time.

## Acceptance Criteria

- [x] Every `<pillar>-api-quality.yml` filter includes `packages/<pillar>-contract/**` and `packages/pillar-sdk/**`.
- [x] Every `<pillar>-quality.yml` (FE app-\* package) filter includes `packages/<pillar>-contract/**` and `packages/pillar-sdk/**`.
- [x] `api-quality.yml` (the legacy monolith) includes `packages/finance-contract/**` and `packages/pillar-sdk/**` (it still imports from both during the cutover).
- [x] `fe-quality.yml` includes `packages/pillar-sdk/**` and a glob over all `packages/*-contract/**`.

## Notes

- This US extends US-01's filters; it's blocked by US-01 because US-01 establishes the per-workflow allowlist shape that this US then expands.
- `packages/pillar-sdk/**` is intentionally not added to db/contract-only workflows (e.g. `<pillar>-db-quality.yml`) — they don't import the SDK.
