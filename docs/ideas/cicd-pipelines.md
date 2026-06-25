# Idea: Re-enable Playwright e2e in CI (REST rewrite)

> Spun out of [CI/CD Pipelines](../themes/platform/prds/cicd-pipelines.md)

## Problem

`fe-test-e2e.yml` (the "E2E Tests" workflow) is **disabled on PR/push** — it runs `workflow_dispatch` only. The suite was written against the deleted `apps/pops-api` tRPC monolith:

- every spec mocks/routes `/trpc/**`, a surface the REST pillar stack does not serve;
- the harness seeded an `e2e` named environment via `POST :3000/env/...`, an endpoint that no longer exists.

The lake is now seven independent REST pillars plus a static-built shell, so the suite cannot pass without a full rewrite. Until then it is gated out so it never blocks CI by booting a deleted backend.

## What a rewrite needs

- Rewrite every spec against the REST pillars (each pillar serves its own ts-rest+zod contract; the Rust `contacts` pillar serves axum+OpenAPI). Replace `/trpc/**` route mocks with the per-pillar REST surfaces.
- Drop the `POST :3000/env/...` seeding path; seed each pillar's SQLite DB directly or via its REST surface.
- Keep the two existing shell webServers in `playwright.config.ts` (the all-modules registry and the `POPS_APPS=finance,core` snapshot) — those are still valid; only the backend wiring is dead.
- Re-enable `push` / `pull_request` triggers on `fe-test-e2e.yml` and route it into the `CI Gate` aggregator's gated-workflow list once green.

## Acceptance criteria (when picked up)

- [ ] Specs pass against the REST pillar stack with no `/trpc` references
- [ ] No reliance on the deleted `POST /env/...` seeding endpoint
- [ ] `fe-test-e2e.yml` triggers on PR + push to `main` again
- [ ] `E2E Tests` is added to `ci-gate.yml`'s gated-workflow list and required in the branch ruleset

## Tracking

`TODO(e2e-rest-rewrite)` in `.github/workflows/fe-test-e2e.yml`.
