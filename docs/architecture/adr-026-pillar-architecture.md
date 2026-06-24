# ADR-026: Per-Domain Pillar Architecture

## Status

Accepted — 2026-06-09

## Context

A workspace audit during PRD-120 part A surfaced multiple architectural smells that share a common root cause: there is no agreed pattern for "where does a domain's code live, and how do domains talk to each other".

**The smells observed:**

1. **Three different patterns for backend services.** Finance / media / inventory / cerebrum keep services in `apps/pops-api/src/modules/<domain>/`. Food keeps them in `packages/app-food/src/db/`. Lists keeps them in `packages/app-lists/src/db/` but has no frontend at all.
2. **`@pops/app-lists` is misnamed.** It's a backend-only data package wearing the `app-*` namespace.
3. **`@pops/app-food` is a frankenstein.** It mixes React frontend, backend persistence, jobs, storage helpers, the DSL pipeline, and a `server.ts` subpath as a band-aid so `pops-api` can consume the backend bits without dragging React into its dep graph.
4. **A latent cycle through `@pops/api`.** `@pops/api-client` imports `AppRouter` from `pops-api`. Every `app-*` package depends on `api-client`. The moment `pops-api` depends on any `app-*` package — which it must for tRPC routers — the cycle closes. PRD-122-API hit it in turbo and pivoted by extracting `@pops/app-food-db`, which treats the symptom domain-by-domain but doesn't fix the layering.
5. **`@pops/db-types` is monolithic.** 67 schema files spanning every domain. A schema change in any one rebuilds the world.
6. **Two parallel "module manifest" systems** (frontend in `app-*/src/manifest.ts`, backend in `pops-api/src/modules/<domain>/index.ts`) with no enforced parity. `@pops/app-lists` has no frontend manifest at all.
7. **`pops-storybook` enumerates only 3 of 7 `app-*` packages**, captured as issue #2706.

The drift accumulated because every PRD made a locally-reasonable choice. Without a written pattern, future PRDs will keep doing the same.

## Decision

POPS adopts a **per-domain pillar architecture**. Each domain is a fully-isolated pillar that ships, deploys, and runs independently. Cross-pillar communication happens exclusively via the platform URI scheme and per-pillar typed contracts. There is no shared database, no shared backend process, no shared `AppRouter` type, and no cross-pillar source imports except through published contract packages.

### Pillar shape — 4 packages per domain

```
packages/<domain>-db/        ← persistence: drizzle schema + row types + services + migrations
packages/<domain>-contract/  ← public surface: zod schemas + inferred types + URI handler types
packages/<domain>-api/       ← runtime: tRPC routers + jobs + backend manifest
packages/<domain>-ui/        ← React: components + pages + forms + frontend manifest
```

**Within-pillar dep graph (tree, no cycles):**

```
<domain>-db ────────► <domain>-contract ────────► <domain>-api ────────► <domain>-ui
                              ▲                          ▲                      │
                              │                          │                      │
                              └───────── consumed by ui (forms) ────────────────┘
                              │
                              └───────── consumed by other pillars (cross-pillar refs) ──────► <other>-api / <other>-ui
```

**Cross-pillar dep graph:**

A pillar may consume another pillar's `-contract` package only — for type-narrowing URI resolutions, sharing public zod schemas, generating iOS/MCP clients. Importing `<other>-db`, `<other>-api`, or `<other>-ui` from anywhere is forbidden.

### Pillar isolation — runtime

- **Each pillar runs in its own Node process / container.**
- **Each pillar owns its own SQLite database.** No cross-pillar FKs. Litestream replicates each DB independently.
- **The URI resolver is pillar-aware.** A URI `pops:food/recipe/<id>` is dispatched to the food pillar's `/uri/resolve` endpoint. If the food pillar is not running, the resolver returns `pillar-unavailable` and the consumer renders a "domain not installed" placeholder rather than failing.
- **No global `AppRouter` type.** Each pillar exports its own `<Pillar>ApiRouter`. `pops-shell` instantiates one tRPC client per pillar (`useFoodTrpc()`, `useFinanceTrpc()`, etc.). The latent cycle through `@pops/api-client` → `@pops/api` is removed by deletion: `api-client` no longer exists.
- **Workers, jobs, cron tasks owned by a pillar live in that pillar's `-api` package.** A pillar's worker container is the same image as its api container, just running a different entrypoint.

### Internal contracts — the three boundaries within a pillar

| Boundary           | Compile-time                                                                                                                                                                                                     | Runtime                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **db → contract**  | `drizzle-zod` derives row schemas from drizzle tables. `<domain>-db` exports `IngredientRowSchema = createSelectSchema(ingredients)`. `<domain>-contract` imports and `.pick()`/`.extend()`s the public surface. | None — no wire crosses. Drift caught at build via TS inference.                                                                                |
| **contract → api** | Public procedures' `.input()` and `.output()` reference `contract` zod schemas. TS infers types via `z.infer`.                                                                                                   | `.input()` parses every call. **`.output()` parses every public procedure** (one of the load-bearing decisions — see "Guarantees" below).      |
| **api → ui**       | tRPC typed-client: `<domain>-ui` imports `type <Pillar>ApiRouter` from `<domain>-api`. `createTRPCReact<XApiRouter>()` produces fully typed hooks.                                                               | `.input()` zod parses on every call (inherited from contract). Outputs trusted by TS for internal procedures; validated for public procedures. |

**Key rules:**

1. **drizzle-zod is the single source of truth at the persistence layer.** `<domain>-contract` derives from `<domain>-db`'s drizzle-zod export, never hand-authors a parallel schema for the same row.
2. **Public procedures (those whose schemas come from `contract`) MUST set `.output(contractSchema)`** so a runtime drift between the service's return shape and the contract's promise trips at the api boundary, not at the ui consumer.
3. **Internal procedures (those whose schemas live in `<domain>-api` directly) MAY skip `.output()` and rely on TS.** Internal procedures must not cross a stability boundary, so a runtime drift caught in integration tests is acceptable.
4. **Form validation in `<domain>-ui` uses zod schemas from `<domain>-contract`** so the ui and the api validate identical shapes from one source.

### Cross-pillar contracts

The only cross-pillar artifacts:

| Artefact                               | Owner             | Consumed by                                             | Mechanism                                               |
| -------------------------------------- | ----------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| URI scheme `pops:<pillar>/<type>/<id>` | platform (`core`) | every pillar that references foreign entities           | runtime HTTP call to the owning pillar's `/uri/resolve` |
| `<pillar>-contract` zod schemas        | the pillar        | other pillars (type narrowing), iOS, MCP                | type-only import or OpenAPI generation                  |
| pillar manifest                        | the pillar        | `pops-shell` (UI install set), `core`'s pillar registry | static config consumed at boot                          |

**Forbidden:**

- `<domain-a>-db` imported from anywhere outside `<domain-a>` packages.
- `<domain-a>-api` imported from anywhere outside `<domain-a>` packages, except by pops-shell (for the typed tRPC client).
- `<domain-a>-ui` imported from anywhere outside `<domain-a>` packages, except by pops-shell.
- Cross-pillar SQL queries or joins. Cross-pillar references happen via the URI scheme and the consumer's pillar fetches the foreign data over the wire if it needs to display it.

### Core is a normal pillar

`core` follows the same 4-package shape and owns:

- Platform tables: `settings`, `user_settings`, `service_accounts`, `sync_logs`, `sync_job_results`, `nudge_log`, `reflex_executions`, AI Ops (`ai_inference_log`, `ai_alert_rules`, `ai_budgets`, `ai_usage`, `ai_providers`, `ai_model_pricing`, `ai_inference_daily`, `ai_alerts`).
- The pillar registry — a small in-memory table of `{ pillarId, baseUrl, healthEndpoint }` populated from env vars (`POPS_PILLARS=food:http://food-api:3000,finance:http://finance-api:3000,...`).
- The URI dispatcher — the platform endpoint `core/uri/resolve` that fans out to the owning pillar based on the URI's pillar prefix.
- Auth gateway primitives — JWT validation helpers consumed by every pillar's api package.

### `@pops/db-types`, `@pops/app-*`, `@pops/api-client` retire

The migration eliminates these packages:

- **`@pops/db-types`** distributes its schemas to each pillar's `-db` package + `core-db`. Cross-cutting types that don't belong to any pillar (e.g. `UriResolverResult`) move to `@pops/types`.
- **`@pops/app-finance`, `@pops/app-media`, `@pops/app-inventory`, `@pops/app-ai`, `@pops/app-cerebrum`, `@pops/app-food`** each split into their per-pillar 4-package set.
- **`@pops/app-lists`** becomes `@pops/lists-db` + `@pops/lists-api` + (if a UI lands later via PRD-139) `@pops/lists-ui` + `@pops/lists-contract`.
- **`@pops/api-client`** is replaced by per-pillar `useXTrpc()` hooks colocated with each pillar's `-ui` (or `-contract` if more useful). No global tRPC client.

### What survives

- `@pops/types` — pure cross-cutting TypeScript types: `ModuleManifest`, `UriHandlerDescriptor`, `UriResolverResult`. Stays small.
- `@pops/ui` — design system + primitives. Consumed by every `<domain>-ui`.
- `@pops/navigation` — shell-level routing helpers. Consumed by `<domain>-ui` packages and `pops-shell`. Doesn't import from `app-*` or `pops-api` — that's what causes today's cycle.
- `@pops/module-registry` — pillar manifest validation and the install-set matrix. Consumed by `pops-shell` and `core-api`.

## Consequences

### Positive

- **True crash isolation.** A bug in food never affects finance.
- **Independent deploys.** Update food alone; finance keeps running.
- **Per-pillar Litestream backups.** Each pillar's DB is a separate stream.
- **Forced discipline.** Cross-pillar coupling becomes structurally impossible. Reviewers don't have to look for it.
- **CI narrows naturally.** A change inside `food-db` triggers only food's tests. A change inside `food-contract` triggers food + any pillar that imports the contract type-only — which is a tiny set.
- **External consumers (iOS, MCP, future web clients) consume each pillar's contract independently** and don't need to know about other pillars.
- **Pillars can be extracted to separate hosts trivially.** Run food on a Pi, run finance on the main server. No code change.
- **PRD-120 issue (no shell page mounting the editor yet) and PRD-110 issue (Litestream YAML in a separate repo) become per-pillar concerns**, not platform-wide blockers.

### Negative

- **Cross-pillar queries are network calls.** Localhost adds ~1-3 ms per call. Imperceptible at single-user scale but it's a real constraint.
- **No FKs across pillars.** Referential integrity becomes the application's responsibility. A food recipe referencing a deleted shopping list will return a "lists-pillar reports not-found" instead of failing at INSERT time.
- **"Show me everything related to X" requires fan-out.** A search that hits 3 pillars is 3 calls. pops-shell aggregates.
- **Each pillar reimplements auth, observability, error handling.** Mitigated by `@pops/types` + shared platform libs consumed by every `-api`.
- **Local dev needs the shell to handle missing pillars gracefully.** A developer working on food alone shouldn't need finance running. `POPS_PILLARS` env var controls which pillars the resolver knows about; missing pillars return `pillar-unavailable`.
- **Schema migrations across contract packages need coordination.** A contract change in one pillar can break consumers. Mitigated by versioned contract packages with explicit deprecation cycles.
- **Workspace grows from 14 packages to ~28** (7 pillars × 4 packages = 28; plus `@pops/types`, `@pops/ui`, `@pops/navigation`, `@pops/module-registry`). Manageable in pnpm/turbo; cognitively heavier per change.
- **Per-feature edits touch 4 packages instead of 1** for changes that span the stack. Accepted as the cost of explicit boundaries.

### What we forfeit by removing cross-pillar FKs

Inventory of cross-domain refs in the schema today + the planned cross-domain refs we're choosing to enforce by URI scheme instead of FK:

| Reference                                       | Old                                                   | New (post-pillar)                                |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `food.recipes.source_id → ingest_sources.id`    | within-pillar                                         | within-pillar (food-db owns both)                |
| `food.batches.location → enum`                  | within-pillar hardcoded enum                          | stays — no plan to FK to inventory locations     |
| `food → app-lists` (`recipe-send-to-list`)      | runtime cross-pillar call (already designed this way) | stays — pops-shell calls food-api then lists-api |
| Cerebrum engrams reference any entity           | URI scheme already                                    | URI scheme                                       |
| AI Ops `ai_inference_log.context_id`            | string-namespaced reference (already not an FK)       | stays — moves to core-db                         |
| Finance entities (people) used by other domains | not used today                                        | accessed via URI scheme when used                |

The audit found **zero** cross-domain FKs in the schema today that we'd lose by going to per-pillar databases. Future cross-domain links were already designed to be URI-shaped per ADR-012.

### Migration

Domain-by-domain. Pilot = food (PRD-122-API's in-flight `@pops/app-food-db` extraction folds into the wider 4-package split). Order: prepare (drizzle-zod adoption, drizzle-kit per-pillar config, pillar registry + URI dispatcher, pops-shell pillar boot, container template) → food → core → finance → media → inventory → cerebrum → lists (pairs with PRD-139 landing the lists frontend).

`ai` does not appear as a separate pillar. AI Ops is owned by the `core` pillar: every AI migration (`0034_ai_observability` through `0056_ai_observability_repair`) was authored against core's shared journal, and all AI backend services already live under `apps/pops-api/src/modules/core/{ai-budgets,ai-observability,ai-alerts,ai-usage,ai-providers}`. The `packages/app-ai/` module is a UI shell over core's tRPC and remains as such; no `packages/ai-db/` or `pops-ai-api` will ever exist. Track I in the migration roadmap formalises this decision.

The migration plan lives in the private `.claude/pillar-migration-roadmap.md` (gitignored, symlinked across pops\* sibling workspaces). Sibling agents check that file for status, ordering, and per-pillar coordination notes.

## Related ADRs

- [ADR-001](./adr-001-sqlite-source.md) — SQLite is the data store. Now: one SQLite per pillar.
- [ADR-004](./adr-004-api-domain-modules.md) — API domain modules. Superseded for backend services: domain modules become per-pillar `-api` packages.
- [ADR-012](./adr-012-universal-object-uri.md) — the URI scheme. Promoted from "convenience for cross-module references" to "the only mechanism for cross-pillar references".
- [ADR-013](./adr-013-drizzle-orm.md) — Drizzle ORM. Still applies; each pillar uses Drizzle independently with `drizzle-zod` for schema derivation.
- [ADR-014](./adr-014-trpc.md) — tRPC. Still applies; per-pillar routers, no global `AppRouter`.
- [ADR-017](./adr-017-openapi-secondary-contract.md) — OpenAPI as a secondary contract. Each pillar's `-contract` package becomes the source for its OpenAPI spec.
