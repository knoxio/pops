# US-03: Relocate core handlers to `pops-core-api`

> Parent: [PRD-254](README.md)

## Surface

`apps/pops-api/src/modules/core/` → `apps/pops-core-api/src/modules/`

| Subdir              | Notes                                          | Cross-pillar deps                       |
| ------------------- | ---------------------------------------------- | --------------------------------------- |
| `ai-alerts/`        | AI alert CRUD                                  | none                                    |
| `ai-budgets/`       | AI budget tracking                             | none                                    |
| `ai-providers/`     | AI provider config                             | none                                    |
| `ai-usage/`         | AI usage metering                              | none                                    |
| `ai-observability/` | AI observability sinks                         | none                                    |
| `corrections/`      | finance/inventory correction queue             | reads finance + inventory state via SDK |
| `embeddings/`       | (already partial in pops-core-api per PRD-249) | none                                    |
| `entities/`         | shared entity (owner) records                  | none                                    |
| `envs/`             | environment / app config                       | none                                    |
| `jobs/`             | job-scheduler endpoints                        | spans multiple pillars                  |
| `pillars/`          | already in pops-core-api (PRD-228)             | n/a                                     |
| `search/`           | cross-pillar search aggregator                 | calls every pillar via SDK              |
| `settings/`         | **already in pops-core-api** (PRD-247)         | n/a                                     |
| `shell/`            | shell helpers                                  | n/a                                     |
| `tag-rules/`        | tag-rule CRUD                                  | none                                    |
| `uri/`              | URI dispatcher                                 | calls every pillar via SDK              |

21 routers, 142 files, 41 H8 violations.

## What's already in pops-core-api

- `settings/` (PRD-247)
- `users/` (PRD-251)
- `pillars/` (PRD-228 registry)
- `embeddings/` (PRD-249 partial)

These don't need re-relocating; ensure the in-monolith equivalents are dropped if duplicates exist.

## Cross-pillar SDK calls needed

- `search/` aggregates results across all pillars — calls `pillar('<x>').*` for each
- `uri/` dispatcher routes URIs to owning pillar's resolver
- `corrections/` reads finance + inventory state
- `jobs/` may invoke handlers across pillars

These already use SDK in places; ensure all do post-relocation.

## Parallelisable sub-PRs

| #   | Slice                                                                         | Notes                            |
| --- | ----------------------------------------------------------------------------- | -------------------------------- |
| 03a | `ai-alerts` + `ai-budgets` + `ai-providers` + `ai-usage` + `ai-observability` | AI cluster, all standalone       |
| 03b | `entities` + `envs` + `tag-rules` + `shell`                                   | small CRUD surfaces              |
| 03c | `corrections` + `search` + `uri` + `jobs`                                     | cross-pillar SDK callers; harder |

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/core/` is empty (or contains only the already-migrated `pillars/`/`settings/`/`embeddings/` adapters slated for removal)
- [ ] `apps/pops-core-api/src/router.ts` mounts all core feature routers
- [ ] 41 core H8 entries removed from `.dependency-cruiser-known-violations.json`
- [ ] `pnpm --filter @pops/core-api typecheck/test/build` clean
- [ ] `pnpm --filter @pops/api typecheck/test/build` clean
- [ ] `pnpm typecheck/lint/lint:boundaries` clean
- [ ] Husky hooks pass
- [ ] nginx `/trpc-core/*` smoke OK on capivara
- [ ] Cross-pillar `search` + `uri` dispatcher work end-to-end
