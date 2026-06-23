# Idea: Human-facing OpenAPI explorer

> Spun out of [PRD: OpenAPI Pillar Contract](../themes/00-platform/prds/openapi-contract/README.md)

## What exists

Every pillar already serves a machine-readable OpenAPI 3.0.x document at `GET /openapi` (`3.0.2` from the TS pillars, `3.0.3` from the Rust `contacts` pillar). The pillar SDK and codegen consumers read it. There is no human-facing rendering of those documents — no Swagger UI, no Redoc, no aggregated API explorer.

## The idea

A browsable API explorer for the fleet, so a developer (or future external integrator) can discover and try the REST surface without reading raw JSON.

Possible shapes:

- A Swagger UI / Redoc view per pillar, mounted by the shell or the orchestrator, pointed at each discovered pillar's `GET /openapi`.
- An aggregated explorer in the orchestrator (`:3009`) that pulls every registered pillar's document from the registry snapshot and renders them under one nav, grouped by pillar.
- A "try it" affordance that proxies requests through the orchestrator so calls carry the right auth.

## Why it's deferred

- Single-user system. The only programmatic consumer today is the pillar SDK, which needs the JSON, not a UI.
- Discovery is already runtime-dynamic (registry snapshot). A static portal would drift; a live one is real work (auth, CORS, proxying).
- No external integrators yet — the audience for an explorer is hypothetical.

## When to pick it up

When a non-SDK consumer (an external service, a phone app written against the REST surface, or a second developer) needs to discover the API by hand. At that point, prefer the orchestrator-aggregated live explorer over per-pillar static UIs — it reuses the registry as the source of truth and stays in sync automatically.

## Open gap: summaries on the Rust `contacts` projection

The TS pillars give every operation a `summary`, and most of them (cerebrum, food, inventory, lists, registry) enforce it with a contract-level test. The Rust `contacts` emitter omits `summary` on most operations (7 of 9 at last check), and no test guards it. Closing this means annotating each `#[utoipa::path]` with a `summary` (or `description`) and adding a summary assertion to `tests/openapi_contract.rs`, mirroring the TS contract tests. Small, mechanical, not yet done.
