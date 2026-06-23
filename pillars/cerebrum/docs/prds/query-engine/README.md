# Query Engine

> Status: Partial — core NL Q&A pipeline (ask / retrieve / explain / SSE stream), scope-aware retrieval, citation attribution and cross-pillar multi-domain retrieval all ship. Scope inference is not yet grounded in a live scope registry (keyword hits resolve against an empty pool and fall through to default), structured retrieval serves engrams only, and there is no relative-date resolution or by-ID lookup bypass. See [ideas/query-engine-grounding-and-precision.md](../../ideas/query-engine-grounding-and-precision.md).

Natural-language Q&A over the user's own knowledge: accept a question, infer retrieval scopes, run in-pillar hybrid retrieval (semantic + structured) optionally fanning out to peer pillars, assemble a token-budgeted context window, generate an LLM answer grounded only in that context, and attribute every claim to a specific source. Retrieval reads cerebrum's own SQLite (`engram_index`, `engram_scopes`, `engram_tags`, `embeddings` / `embeddings_vec`); cross-domain rows are resolved over REST against the finance, media and inventory pillars (per-domain HTTP clients whose base URLs are read from `POPS_PILLARS`).

## Data Model

No new tables — the engine is a read path over the existing engram index and embeddings. Request/response shapes (wire schemas in `src/contract/rest-query-schemas.ts`):

**QueryRequest** (`ask` / `stream`): `question` (string, required, min 1) · `scopes?` (string[]) · `includeSecret?` (boolean, default false) · `maxSources?` (int 1–50, default 10) · `domains?` (`engrams` | `transactions` | `media` | `inventory`). `retrieve` takes the same minus `domains`; `explain` takes `question` only.

**QueryResponse** (`ask`): `answer` (string) · `sources` (SourceCitation[]) · `scopes` (string[] actually used) · `confidence` (`high` | `medium` | `low`).

**SourceCitation**: `id` · `type` (`engram` | `transaction` | `movie` | `tv_show` | `inventory`) · `title` · `excerpt` (≤200 chars) · `relevance` (number) · `scope`.

**explain response**: `scopeInference` (`{ scopes, source: explicit|inferred|default }`) · `retrievalPlan` (`{ filters, maxSources, threshold }`) · `secretNotice` (string | null).

## REST API Surface

- `POST /query/ask` — full pipeline: scope inference → hybrid retrieval → context assembly → LLM → citation parsing. Returns QueryResponse.
- `POST /query/retrieve` — retrieval only, no LLM. Returns `{ sources: SourceCitation[] }`.
- `POST /query/explain` — debug: returns the scope inference + retrieval plan without executing retrieval or the LLM.
- `POST /query/stream` — SSE variant of `ask` (same body). Cannot be modelled in ts-rest, so mounted as a plain Express route ahead of the contract router. Streams `{ type: 'token', text }` frames followed by one terminal `{ type: 'done', answer, sources, scopes, confidence, tokensIn, tokensOut }` frame.

All routes are POST (scope/domain arrays ride in the body), stateless, and served on the docker-network trust boundary with no per-request auth. The LLM ports (one-shot + streaming) are injected so tests run fully offline; production uses an Anthropic-backed implementation (`claude-sonnet-4-6`, overridable via `CEREBRUM_QUERY_MODEL`) reporting usage to the `ai` pillar via `@pops/ai-telemetry`.

## Business Rules

- **Hybrid retrieval.** The semantic leg (query embedding → `embeddings_vec` cosine) and the structured leg (BM25-style filter over `engram_index` + scope/tag junctions) run in parallel and merge by reciprocal rank fusion (RRF, k=60). The semantic leg is best-effort: a missing embedding client, vec-unavailable DB, or provider error collapses it to empty and retrieval falls back to the structured leg.
- **Secret hard-block.** `*.secret.*`-scoped sources are excluded at retrieval time unless `includeSecret: true`. The block applies in both legs (the structured leg and the semantic metadata resolver drop secret scopes) and again as a post-fusion filter — a source with any secret scope is excluded, even if it also carries non-secret scopes.
- **Scope inference.** Explicit `scopes` override inference entirely. Otherwise question text is matched against work/personal keyword lists; ambiguous questions fall through to `source: 'default'`. Secret keywords in the question produce a `secretNotice` on `explain`.
- **Context assembly.** Sources are ranked by RRF score, de-duplicated by content hash (falling back to `type:id`), and packed into a ~4096-token budget; truncation is at a sentence boundary. Cross-pillar rows (no `content_preview` of their own) are folded into a human-readable `text` body by per-domain formatters.
- **Grounded answer.** The system prompt instructs the model to answer only from the provided context, cite every claim with a bracketed source ID (`[eng_YYYYMMDD_HHMM_slug]`), include amount+date for transactions and title+type for media, and state explicitly when the context is insufficient.
- **Citation validation.** Inline `[engram_id]` and `[type:id]` citations are parsed and validated against the retrieved set; any ID not in the set is stripped from the answer and logged as a hallucinated citation. Surviving citations become the `sources` array, ordered by relevance.
- **Confidence.** Derived from the top source's relevance: `high` > 0.8, `medium` 0.5–0.8, `low` below 0.5. An answer that survives citation validation with zero valid citations is downgraded to `low`.
- **Multi-domain.** `domains` maps to retrieval source types and filters at retrieval time. Cross-domain rows (`transaction`, `movie`, `tv_show`, `inventory`) are enriched over REST via per-domain peer HTTP clients (base URLs from `POPS_PILLARS`); a peer that is absent / unregistered drops that source type's hits rather than erroring. Engram and cross-pillar rows interleave purely by relevance — domain type does not affect ranking.

## Edge Cases

| Case                                                  | Behaviour                                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty / whitespace question                           | Rejected with 400 before any retrieval (`question` min length 1)                                                                               |
| No source above the relevance threshold (default 0.3) | `{ answer: "I don't have information about that.", sources: [], confidence: "low" }` (stream emits a single no-info token then a `done` frame) |
| LLM invents a plausible source ID                     | Stripped from the answer, logged, excluded from `sources`                                                                                      |
| Question spans engrams + structured domains           | Semantic leg returns both; context assembly interleaves by relevance                                                                           |
| Retrieved context exceeds the token budget            | Lowest-relevance sources dropped until it fits; body truncated at a sentence boundary                                                          |
| LLM API key missing or call fails                     | Degrades to a display-safe fallback answer string — never throws                                                                               |
| A queried peer pillar is unregistered                 | That source type's hits are dropped; the query still answers from what remains                                                                 |

## Acceptance Criteria

- [x] `POST /query/ask` accepts a QueryRequest (min: a `question` string) and returns `{ answer, sources, scopes, confidence }`.
- [x] The pipeline normalises the question, runs hybrid retrieval (semantic + structured, RRF-fused), ranks and de-duplicates sources, assembles a token-budgeted context window, and sends context + question to the LLM.
- [x] The system prompt forces context-only answers, bracketed source-ID citations, and an explicit "insufficient information" response.
- [x] Zero sources above the threshold yields the no-info answer with `confidence: 'low'`.
- [x] `POST /query/retrieve` returns sources without invoking the LLM.
- [x] `POST /query/explain` returns the scope inference + retrieval plan (and a secret notice) without executing retrieval.
- [x] `POST /query/stream` streams token frames then a terminal `done` frame with parsed citations; an empty body is rejected 400 before the stream opens.
- [x] Explicit `scopes` skip inference; otherwise work/personal keywords narrow scopes and ambiguous questions default; inferred scopes appear in the response.
- [x] `*.secret.*` sources are excluded at retrieval time unless `includeSecret: true`, including sources mixing secret and non-secret scopes.
- [x] Every QueryResponse carries `sources` with `id`, `type`, `title`, `excerpt`, `relevance`, `scope`; excerpts truncate to ≤200 chars at a word boundary; sources are ordered by relevance.
- [x] Hallucinated citation IDs are stripped from the answer and excluded from `sources`; an answer with zero valid citations is downgraded to `low`.
- [x] `domains` filters retrieval to the named source types; cross-pillar rows (`transaction`/`movie`/`tv_show`/`inventory`) are enriched over REST from the owning pillar and interleaved with engrams by relevance.
- [x] A frontend QueryPage drives `/query/stream`, rendering tokens as they arrive and the final sources.
