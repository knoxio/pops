# Document Generation

> Status: Done — full pipeline shipped (5 endpoints, three modes, scope filtering, preview, Documents UI). Generated documents are ephemeral strings; persisting/saving them as engrams is not built (see [ideas/document-persistence.md](../ideas/document-persistence.md)).

Produces structured output documents — reports, summaries, timelines — from the cerebrum corpus (engrams live in the cerebrum pillar's own SQLite DB). Every document is scope-filtered and audience-aware: the pipeline declares the output's audience scope and hard-blocks `*.secret.*` content unless the caller explicitly opts in. Builds on the in-pillar retrieval slice (hybrid search + context assembly) and the query slice's citation parser.

The pipeline is stateless: all scope/audience/type filtering rides in the request body, never derived from a caller identity. Served on the docker-network trust boundary with no per-request auth, like the other cerebrum domains.

## Data Model

### GenerationRequest (body)

| Field           | Type        | Required        | Description                                                                                                        |
| --------------- | ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `mode`          | enum        | for `/generate` | `report` \| `summary` \| `timeline`                                                                                |
| `query`         | string      | report mode     | Topic/question to generate from                                                                                    |
| `dateRange`     | `{from,to}` | summary mode    | ISO-ish date strings; `from <= to` enforced                                                                        |
| `scopes`        | string[]    | No              | Explicit scope filter passed to retrieval                                                                          |
| `audienceScope` | string      | No              | Intended audience (e.g. `work.*`); controls inclusion. Defaults to broadest non-secret prefix of retrieved sources |
| `includeSecret` | boolean     | No              | Opt-in for `*.secret.*` content (default `false`)                                                                  |
| `types`         | string[]    | No              | Filter engrams by type (`decision`, `meeting`, …)                                                                  |
| `tags`          | string[]    | No              | Filter engrams by tags                                                                                             |
| `format`        | enum        | No              | `markdown` (default) \| `plain` — accepted; LLM output is Markdown                                                 |
| `groupBy`       | enum        | No              | `type` \| `month` \| `quarter` — timeline grouping                                                                 |

### GeneratedDocument

`{ title, body, mode, sources: SourceCitation[], audienceScope, dateRange: {from,to}|null, metadata }`

- `SourceCitation` = `{ id, type, title, excerpt (≤200 chars, word-boundary), relevance, scope }`
- `metadata` = `{ sourceCount, dateRange|null, scopeCoverage: string[], mode, truncated }`

## REST API Surface

Contract: `pillars/cerebrum/src/contract/rest-emit.ts` (mounted under router key `emit`). All POST — bodies carry filter objects/arrays that don't round-trip through a query string.

| Endpoint              | Body                                                                                       | Response                                         |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `POST /emit/generate` | GenerationRequest (`mode` required)                                                        | `{ document: GeneratedDocument\|null, notice? }` |
| `POST /emit/report`   | `{ query, scopes?, audienceScope?, includeSecret?, types?, tags? }`                        | `{ document\|null }`                             |
| `POST /emit/summary`  | `{ dateRange, query?, scopes?, audienceScope?, includeSecret?, types?, tags? }`            | `{ document\|null }`                             |
| `POST /emit/timeline` | `{ query?, scopes?, dateRange?, audienceScope?, includeSecret?, types?, tags?, groupBy? }` | `{ document\|null }`                             |
| `POST /emit/preview`  | GenerationRequest                                                                          | `{ sources: SourceCitation[], outline: string }` |

LLM port (`GenerationLlm`) is injected so tests run offline; production uses an Anthropic-backed client (`claude-sonnet-4-6`, `CEREBRUM_EMIT_MODEL` override, temperature 0). A missing `ANTHROPIC_API_KEY` degrades to an "unavailable" placeholder string rather than throwing; a transport error throws → 500.

## Business Rules

- **Pipeline**: retrieve (hybrid search, cap 20 sources, relevance threshold 0.2) → scope filter → assemble context (8192-token budget) → mode-specific LLM synthesis → parse + attach citations.
- **Secret hard-block**: any engram with a `secret` segment in any scope is excluded from retrieval and content unless `includeSecret: true`. Enforced both as a retrieval-time filter and a post-retrieval safety net — secret content never enters the LLM context.
- **Most-restrictive-wins**: an engram with both a matching audience scope and a secret scope (e.g. `[work.projects.karbon, work.secret.jobsearch]`) is excluded unless `includeSecret: true` (consistent with the scope model).
- **Audience filtering**: when `audienceScope` is set, only engrams whose scopes match the prefix are included; `work.*` excludes `personal.*`. `includeSecret:true` with `audienceScope:work.*` includes `work.secret.*` but not `personal.secret.*`.
- **Default audience scope**: when omitted, computed as the shortest common non-secret prefix across retrieved sources (`<prefix>.*`), or `all` if none.
- **Report**: structured Markdown — H1 title, intro, H2 subtopic sections, conclusion. Every claim cites its engram by `[engram_id]`. Fewer than 2 sources → `{ document: null, notice: "Insufficient data to generate a meaningful report" }`; zero sources → `notice: "No relevant engrams found for this query"`.
- **Summary**: digest over a date range. Prompt instructs a top "Highlights" H2 (3–5 items ranked by `TYPE_IMPORTANCE`: decision > research > meeting > idea > journal > note > capture), then per-type H2 sections (only types with content), each a bulleted list of title + date + one-sentence synthesis. Empty range → an empty-summary document noting "No engrams found between {from} and {to}". Results capped at 50 (by relevance); `metadata.truncated` flags a covered subset.
- **Timeline**: chronological entries (oldest first by `createdAt`). Prompt format per entry: `**YYYY-MM-DD** — [type_badge] **Title** — summary [engram_id]`. `groupBy` produces per-type / per-month / per-quarter H2 sections. Single entry → body appends a "single point in time" note. Metadata-only (empty body) engrams appear with date+title and "metadata only" in place of a summary.
- **Synthesis discipline**: every mode prompt instructs the model to synthesise (not copy), cite every claim by source ID, maintain a tone matching `audienceScope`, and never introduce information absent from the sources.
- **Citations**: parsed from LLM output against the retrieved set (same `[engram_id]` format and `CitationParser` as the query engine); `sources` carries the resolved set.
- **Ephemeral output**: documents are returned as strings, never stored.

## Edge Cases

| Case                                                        | Behaviour                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Report query → 0 engrams                                    | `{ document: null, notice: "No relevant engrams found for this query" }`           |
| Report → 1 source                                           | `{ document: null, notice: "Insufficient data to generate a meaningful report" }`  |
| Summary range → 0 engrams                                   | Empty-summary document with explanatory note                                       |
| Timeline → 0 engrams                                        | `{ document: null, notice: "No relevant engrams found for this timeline" }`        |
| Timeline → 1 engram                                         | Valid single-entry timeline + appended note                                        |
| `audienceScope: work.*` with `personal.*` sources retrieved | Personal-scoped excluded; only `work.*` content kept                               |
| `includeSecret:true` + `audienceScope:work.*`               | `work.secret.*` included; `personal.secret.*` still excluded                       |
| `dateRange.from > to`                                       | 400 ValidationError                                                                |
| Empty-body (metadata-only) engram                           | In timeline (date+title, "metadata only"); LLM omits from report/summary synthesis |
| Missing `ANTHROPIC_API_KEY`                                 | Document body is the unavailable placeholder string (no throw)                     |
| LLM transport failure                                       | 500                                                                                |
| 100+ engrams for a summary                                  | Capped at 50 by relevance, `metadata.truncated: true`                              |

## Frontend

`pillars/cerebrum/app` Documents page (`/cerebrum/documents`, `DocumentsPage.tsx`): mode picker + filters form (mode, query, audienceScope, scopes, tags, dateFrom/dateTo, includeSecret) with client-side validation, a Preview action (`/emit/preview` → sources + outline), and Generate/Regenerate (`/emit/generate`) surfacing the document or notice inline. History persistence is not built.

## Acceptance Criteria

- [x] `POST /emit/report` takes a query + optional filters and returns a `GeneratedDocument`; pipeline retrieves → clusters/synthesises sections → cites by `[engram_id]`; `sources` carries id/title/excerpt/relevance/scope.
- [x] Report with < 2 sources returns the insufficient-data notice instead of a thin document.
- [x] `POST /emit/summary` takes a required `dateRange` + optional filters; prompt groups by type with a Highlights section ranked by type importance; empty range returns an empty summary with a note; results capped at 50 with `truncated` set; `metadata.dateRange` reflects the actual covered span.
- [x] `POST /emit/timeline` returns chronological entries (oldest first) with date/type-badge/title/one-line summary; `groupBy` yields type/month/quarter sections; single-entry and metadata-only cases handled; `dateRange` reflects earliest→latest.
- [x] `POST /emit/preview` returns sources + outline without full synthesis.
- [x] Every generation request accepts `audienceScope`; retrieval is filtered to the matching prefix at query time, not scrubbed post-generation.
- [x] `*.secret.*` engrams are excluded from retrieval and content unless `includeSecret:true`; most-restrictive-wins for mixed-scope engrams; secret content never reaches the LLM context.
- [x] `includeSecret:true` with an `audienceScope` only admits secret content inside that audience scope.
- [x] `audienceScope` defaults to the shortest common non-secret prefix of retrieved sources; the applied scope is echoed in `document.audienceScope` and `metadata`.
- [x] `dateRange.from > to` is rejected with a 400.
- [x] Documents page generates and previews against the live `emit` endpoints and renders document/notice/sources inline.
