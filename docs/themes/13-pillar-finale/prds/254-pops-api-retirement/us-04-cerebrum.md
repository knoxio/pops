# US-04: Relocate cerebrum handlers to `pops-cerebrum-api`

> Parent: [PRD-254](README.md)

## Surface

`apps/pops-api/src/modules/cerebrum/` → `apps/pops-cerebrum-api/src/modules/`

| Subdir       | Notes                            | Cross-pillar deps                       |
| ------------ | -------------------------------- | --------------------------------------- |
| `adapters/`  | LLM provider adapters            | calls core for provider config          |
| `ai-tools/`  | tool-calling registry + handlers | spans pillars via SDK                   |
| `ego/`       | ego/chat session                 | calls embeddings + core AI config       |
| `emit/`      | event emission glue              | none                                    |
| `engrams/`   | engram CRUD + lifecycle          | reads media for source refs             |
| `glia/`      | background workers               | spans pillars                           |
| `ingest/`    | document/text ingestion pipeline | calls embeddings                        |
| `nudges/`    | (already in pops-cerebrum-api)   | n/a                                     |
| `plexus/`    | cross-engram graph               | none (cerebrum-internal)                |
| `query/`     | Q&A query pipeline               | calls core AI + retrieval               |
| `reflex/`    | reflex/automation triggers       | spans pillars                           |
| `retrieval/` | retrieval + semantic search      | uses cerebrum embeddings                |
| `templates/` | prompt templates                 | none                                    |
| `thalamus/`  | cross-source aggregator          | calls inventory, media, finance via SDK |
| `workers/`   | worker entrypoints               | spans pillars                           |

14 routers, 250 files, 49 H8 violations.

## What's already in pops-cerebrum-api

- `nudges/` (PRD-228 era)
- `debrief/` SDK primitives (PRD-248)
- `embeddings/` (PRD-249)

## Cross-pillar SDK calls needed

- `thalamus/` is the heaviest cross-pillar consumer — aggregates inventory, media, finance state
- `ai-tools/` registers tools that call pillar handlers
- `engrams/` reads media for source URI resolution
- `query/` + `retrieval/` use cerebrum's own embeddings (intra-pillar) but call core AI for provider routing

Most SDK procedures should exist; gaps surface as STOP-and-file precursors.

## Dependencies

- US-03 core relocation should land first (cerebrum calls core AI for provider routing)
- US-05 media has minor coupling (engrams referencing media URIs)

## Parallelisable sub-PRs

| #   | Slice                                             | Notes                                   |
| --- | ------------------------------------------------- | --------------------------------------- |
| 04a | `ego` + `query` + `retrieval` + `templates`       | Q&A pipeline                            |
| 04b | `engrams` + `ingest` + `plexus`                   | engram lifecycle                        |
| 04c | `adapters` + `ai-tools` + `nudges-extra` + `emit` | tool + adapter cluster                  |
| 04d | `glia` + `reflex` + `workers` + `thalamus`        | background + aggregator (most coupling) |

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/cerebrum/` is empty
- [ ] `apps/pops-cerebrum-api/src/router.ts` mounts all cerebrum feature routers
- [ ] 49 cerebrum H8 entries removed from `.dependency-cruiser-known-violations.json`
- [ ] `pnpm --filter @pops/cerebrum-api typecheck/test/build` clean
- [ ] `pnpm --filter @pops/api typecheck/test/build` clean
- [ ] `pnpm typecheck/lint/lint:boundaries` clean
- [ ] Husky hooks pass
- [ ] nginx `/trpc-cerebrum/*` smoke OK on capivara
- [ ] AI tools call across pillars end-to-end (one inventory tool call + one media tool call as smoke)
