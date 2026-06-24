# Retrieval Engine

> Status: Done — the unified read surface (`semantic | structured | hybrid`, context assembly, similar, stats) is live under `/retrieval/*`. Multi-chunk `chunkRange` attribution is the only declared-but-unbuilt remnant (see ideas).

The unified query layer over the cerebrum pillar's own SQLite DB. It combines semantic search (vector k-NN via sqlite-vec over `embeddings_vec`), structured search (SQL filters over `engram_index` + junction tables), and hybrid search (both, fused with reciprocal rank fusion). It also assembles token-budgeted context windows for LLM consumption with source attribution. Engrams live in cerebrum.db alongside the embeddings; cross-pillar hits (finance transactions, media movies/tv shows, inventory items) are enriched over REST via the `@pops/pillar-sdk` peer clients.

The retrieval services are stateless: all scope/type/status/tag filtering rides in the request body (`RetrievalFilters`), never derived from caller identity. The domain is served on the docker-network trust boundary with no per-request auth.

## Data model (read-only over existing tables)

Retrieval owns no tables of its own. It reads:

- `engram_index` — one row per engram: `id`, `title`, `type`, `source`, `status`, `created_at`, `modified_at`, `word_count`, `content_hash`, `custom_fields` (JSON).
- `engram_scopes`, `engram_tags` — junction tables keyed by `engram_id`.
- `embeddings` — `source_type`, `source_id`, `chunk_index`, `content_preview`, `content_hash`, plus the `embeddings_vec` sqlite-vec virtual table where `embeddings.id == embeddings_vec.rowid`.

Embedding generation/storage and index sync are owned upstream (Vector Storage, Engram Indexing & Sync); this PRD only queries what they populate.

## REST API surface

`POST`s carry the filter object / arrays that don't round-trip through a query string; `stats` is a `GET`.

| Endpoint                  | Body                                                                                                                                                  | Returns                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /retrieval/search`  | `query?`, `mode` (`semantic\|structured\|hybrid`, default `hybrid`), `filters?`, `limit` (≤100, default 20), `threshold` (0–2, default 0.8), `offset` | `{ results: RetrievalResult[], meta: { total, mode } }`                                |
| `POST /retrieval/context` | `query`, `filters?`, `tokenBudget` (default 4096), `includeMetadata` (default true), `maxResults` (≤100, default 20)                                  | `{ context, sources: SourceAttribution[], truncated, tokenEstimate }`                  |
| `POST /retrieval/similar` | `engramId`, `limit` (≤100, default 20), `threshold` (default 0.8), `filters?`                                                                         | `{ results: RetrievalResult[] }`                                                       |
| `GET /retrieval/stats`    | —                                                                                                                                                     | `{ indexed, embedded, sourceTypes: Record<string,number>, lastUpdated: string\|null }` |

**`RetrievalFilters`**: `{ types?, scopes?, tags?, dateRange?: { from?, to? }, status?, sourceTypes?, customFields?: Record<string,unknown>, includeSecret? }`.

**`RetrievalResult`**: `{ sourceType, sourceId, title, contentPreview, score, distance?, matchType: 'semantic'|'structured'|'both', metadata: Record<string,unknown> }` — `metadata` is an open bag (engram hits carry `type`/`scopes`/`tags`/`wordCount`/`contentHash`/…; cross-pillar hits carry the enriched domain fields plus a folded `text` preview).

**`SourceAttribution`**: `{ sourceType, sourceId, title, relevanceScore, chunkRange? }`.

## Business rules

- **Mode routing.** `search` routes to semantic-only, structured-only, or hybrid by `mode`, defaulting to `hybrid`.
- **Semantic leg.** Embeds the query via the injected embedding client, then runs k-NN against `embeddings_vec`, fetching `limit * 3` candidates and dropping any with `distance > threshold`. Results dedupe by `source_type:source_id` (closest chunk wins). `score = max(0, 1 - distance)`; `distance` is the raw cosine distance. `contentPreview` is the first 200 chars of the chunk preview.
- **Graceful semantic degradation.** The semantic leg is best-effort: no embedding client configured (no `EMBEDDING_API_KEY`), sqlite-vec unavailable in hybrid, or a provider error all collapse it to an empty list (logged), so hybrid falls back to the structured leg. In `mode: 'semantic'` a vec-unavailable DB raises; a missing embedding client returns `[]`.
- **Structured leg.** Builds parameterised SQL over `engram_index` + junctions. `types` OR-match (`IN`), `scopes` OR-match via prefix (`scope = f OR scope LIKE 'f.%'`), `tags` AND-match (engram must carry every requested tag), `dateRange` filters on `created_at`, `status` OR-match, `customFields` via `json_extract($.<key>)` on the `custom_fields` column. Ordered by `modified_at` desc; `limit` (≤100) + `offset` for pagination. If `sourceTypes` is set and excludes `engram`, the structured leg returns `[]` (it only knows engrams).
- **Orphaned exclusion.** Entries with `status = 'orphaned'` are excluded unless `status: ['orphaned']` is explicitly requested.
- **Secret-scope exclusion.** Engrams whose scope is `secret`, `secret.*`, `*.secret`, or `*.secret.*` are excluded unless `includeSecret: true`. Enforced in the structured SQL (`NOT EXISTS`), in semantic metadata resolution, and again on the final merged hybrid set — a secret engram is dropped even if it ranks highly semantically.
- **Hybrid fusion.** Runs the two legs in parallel and merges with reciprocal rank fusion: `score = Σ 1/(k + rank_i)`, `k = 60`, `rank_i` the 1-based position in each list. A hit present in both lists is a single entry with `matchType: 'both'`, summed score, and merged metadata; otherwise `matchType` reflects its single source. Merged set sorted by descending score, capped at `limit`.
- **Cross-pillar enrichment.** Semantic hits whose `source_type` is `transaction` / `movie` / `tv_show` / `inventory` are resolved over REST through the peer SDK clients (finance / media / inventory). A peer absent from `POPS_PILLARS` (client `undefined`), or a row that no longer exists, drops that hit. Scope filtering does not apply to non-engram source types; they are governed only by `sourceTypes`.
- **Similar.** Reads the engram's existing vector straight from `embeddings_vec` by `source_id` (lowest `chunk_index`) — no embedding call — then runs k-NN excluding the source itself. An unknown engram id returns `[]` (not an error). Filters apply post-retrieval.
- **Context assembly.** Runs a hybrid search internally (`maxResults`, threshold 0.8), then packs results in descending relevance into delimited sections: a `---` separator, a `[source_type:source_id] title` header (with `type | scopes | tags | date` appended when `includeMetadata`), then the content body. Token count is approximated as `ceil(words * 1.3)` (no tokeniser). Results are added until the next would exceed the remaining budget; a result that partially fits is truncated at a sentence boundary (`/[.!?]\s/`, searched in the last 20% of the slice) or hard at the budget, with ` [truncated]` appended, and packing stops. Duplicate bodies are dropped by `content_hash` (falling back to `source_type:source_id`). The response lists every included result in `sources` for citation and reports the running `tokenEstimate` and a `truncated` flag.
- **Validation.** Empty/whitespace query is a 400 for `semantic`/`hybrid` search and for `context`. `structured` mode requires at least one filter, else 400. `structured` with filters and no query text is valid.
- **Stats.** `indexed` = `engram_index` row count; `embedded` and the per-`source_type` breakdown come from `embeddings`; `lastUpdated` is `max(embeddings.created_at)` or null.

## Edge cases

| Case                                             | Behaviour                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Empty query, semantic/hybrid/context             | 400 (`retrieval.queryRequired` / `retrieval.contextQueryRequired`)  |
| Empty query, structured, no filters              | 400 (`retrieval.filterRequired`)                                    |
| Empty query, structured, with filters            | Valid — filter matches ordered by `modified_at` desc                |
| No results match                                 | `{ results: [], meta: { total: 0 } }` — not an error                |
| All semantic hits beyond threshold               | Semantic leg empty; structured hits may still surface in hybrid     |
| Embedding client unconfigured / provider error   | Semantic leg empty (logged); hybrid degrades to structured-only     |
| sqlite-vec unavailable                           | Hybrid degrades to structured-only; explicit `semantic` mode raises |
| `sourceTypes` excludes `engram` (structured leg) | Returns `[]` — the structured leg only knows engrams                |
| Token budget smaller than the first result       | First result truncated to fit; `truncated: true`                    |
| Scope filter matches zero engrams                | Empty results — no error                                            |
| Orphaned index entry                             | Excluded everywhere unless `status: ['orphaned']`                   |
| Cross-pillar peer absent / row deleted           | Hit dropped (enrichment unavailable)                                |
| Same content via both legs                       | Single `matchType: 'both'` entry with fused score                   |
| `similar` for unknown engram id                  | `{ results: [] }`                                                   |

## Acceptance criteria

- [x] `POST /retrieval/search` routes by `mode` (default `hybrid`); `mode: 'semantic'` embeds the query and runs k-NN over `embeddings_vec`, returning `RetrievalResult[]` ordered closest-first with `score = max(0, 1 - distance)`, `distance`, and 200-char `contentPreview`.
- [x] Distance `threshold` (default 0.8, range 0–2) drops farther hits; `limit` caps results (default 20, max 100); the query embedding is single-use and never persisted.
- [x] Structured search filters `engram_index` + junctions: `types`/`status` OR-match, `scopes` OR-match by prefix, `tags` AND-match, `dateRange` on `created_at`, `customFields` via `json_extract`; `sourceTypes` excluding `engram` short-circuits the leg to `[]` (it only knows engrams); ordered by `modified_at` desc with `limit`/`offset` pagination.
- [x] Orphaned entries excluded unless `status: ['orphaned']`; secret-scoped engrams excluded unless `includeSecret: true`, enforced on the structured leg, semantic resolution, and the merged hybrid set.
- [x] Hybrid runs both legs in parallel and fuses with RRF (`k = 60`): shared hits become one `matchType: 'both'` entry with summed score and merged metadata; merged set sorted by descending score and capped at `limit`.
- [x] Semantic leg degrades gracefully — missing embedding client, vec-unavailable DB, or provider error collapse it to `[]` so hybrid falls back to the structured leg.
- [x] Cross-pillar semantic hits (`transaction`/`movie`/`tv_show`/`inventory`) are enriched over REST via the peer SDK; a peer absent from `POPS_PILLARS` or a deleted row drops the hit; scope filtering does not apply to non-engram sources.
- [x] `POST /retrieval/similar` reads the engram's existing vector from `embeddings_vec` (no embedding call), runs k-NN excluding the source, applies filters post-retrieval, and returns `[]` for an unknown id.
- [x] `POST /retrieval/context` runs hybrid internally, packs results in relevance order into delimited sections with `[source_type:source_id] title` headers (metadata-augmented when `includeMetadata`), counts tokens as `ceil(words * 1.3)`, truncates the overflowing result at a sentence boundary with ` [truncated]`, dedupes by `content_hash`, and returns `context`, `sources`, `truncated`, and `tokenEstimate`.
- [x] Empty/whitespace queries return 400 for semantic/hybrid/context; structured mode requires at least one filter.
- [x] `GET /retrieval/stats` reports `indexed` (engram_index count), `embedded` + per-`source_type` breakdown (from embeddings), and `lastUpdated = max(embeddings.created_at)`.
