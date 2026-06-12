# PRD-179: cerebrum.engrams cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `cerebrum.engrams.*` procedures + the engram-family tables (`engram_index`, `engram_scopes`, `engram_tags`, `engram_links`) and the vector store (`embeddings_vec`) into `cerebrum.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Engrams are cerebrum's atomic memory units — capture text, embed, link, retrieve. This is the largest cerebrum slice, with vector search complexity layered on top of standard SQL.

## Data Model

Tables (move from shared to `packages/cerebrum-db`):

- `engram_index` — root engram metadata
- `engram_scopes` — per-engram scope tags (engrams can belong to multiple scopes)
- `engram_tags` — free-form tags
- `engram_links` — engram → engram graph (relate, references, contradicts, ...)
- `embeddings_vec` — sqlite-vec extension table; stores embedding vectors with `vec_distance_cosine` queries

The `embeddings_vec` table requires the `sqlite-vec` extension to be loaded. The cerebrum pillar already loads it at boot (existing pattern).

## API Surface

| Procedure                       | Kind                            |
| ------------------------------- | ------------------------------- |
| `cerebrum.engrams.create`       | mutation                        |
| `cerebrum.engrams.get`          | query                           |
| `cerebrum.engrams.list`         | query                           |
| `cerebrum.engrams.update`       | mutation                        |
| `cerebrum.engrams.delete`       | mutation                        |
| `cerebrum.engrams.search`       | query (vector + lexical hybrid) |
| `cerebrum.engrams.reclassify`   | mutation                        |
| `cerebrum.engrams.links.create` | mutation                        |
| `cerebrum.engrams.links.list`   | query                           |

Files today: `apps/pops-api/src/modules/cerebrum/engrams/{file.ts, id.ts, reclassify.ts, handlers/}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- `embeddings_vec` requires sqlite-vec; per-pillar baseline migration declares the extension loadable on the cerebrum container's runtime.
- Backfill embeddings: large blob payloads; batched copies. Acceptable first-boot cost.
- Hybrid search service is in-process today and stays so; only its handle changes.

## Edge Cases

| Case                                                  | Behaviour                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| sqlite-vec extension not loaded on cerebrum container | Pillar fails healthcheck at boot; explicit error logged.                          |
| Backfill of large embeddings table is slow            | Acceptable on first boot only; subsequent boots no-op.                            |
| Search query while half-backfilled                    | Returns what's available; consumer sees partial results until backfill completes. |
| Vector dimension mismatch on backfill                 | Caught at insert time; cerebrum baseline declares the expected dimension.         |

## User Stories

| #   | Story                                                       | Summary                                                              |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + vec extension + services in `@pops/cerebrum-db`     |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                      |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router + hybrid-search service to `getCerebrumDrizzle()` |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                          |

## Out of Scope

- Embedding-model changes; only persistence moves.
- Hybrid-search ranking changes.
- Cross-pillar engram references (separate URI-handler concern).
