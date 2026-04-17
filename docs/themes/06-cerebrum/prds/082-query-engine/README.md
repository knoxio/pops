# PRD-082: Query Engine

> Epic: [03 — Emit](../../epics/03-emit.md)
> Status: Not started

## Overview

Define the natural language Q&A engine that accepts a question, infers the appropriate scopes, retrieves relevant context from Thalamus (engrams and POPS SQLite data), assembles a grounded context window, generates an LLM answer, and attributes every claim to specific source engrams. This is the foundation of Cerebrum's output layer — PRDs 083 and 084 build on the retrieval and grounding patterns established here.

## Data Model

### Query Request

| Field           | Type     | Required | Description                                                                           |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| `question`      | string   | Yes      | Natural language question                                                             |
| `scopes`        | string[] | No       | Explicit scope filter — if absent, inferred from question context                     |
| `includeSecret` | boolean  | No       | Opt-in for `*.secret.*` content (default: `false`)                                    |
| `maxSources`    | number   | No       | Maximum number of source engrams to retrieve (default: 10)                            |
| `domains`       | string[] | No       | Data domains to query: `engrams`, `transactions`, `media`, `inventory` (default: all) |

### Query Response

| Field        | Type             | Description                                                      |
| ------------ | ---------------- | ---------------------------------------------------------------- |
| `answer`     | string           | LLM-generated answer grounded in retrieved context               |
| `sources`    | SourceCitation[] | Engrams and data records cited in the answer                     |
| `scopes`     | string[]         | Scopes used for retrieval (explicit or inferred)                 |
| `confidence` | string           | `high`, `medium`, `low` — based on source relevance and coverage |

### SourceCitation

| Field       | Type   | Description                                                   |
| ----------- | ------ | ------------------------------------------------------------- |
| `id`        | string | Engram ID or POPS record identifier                           |
| `type`      | string | `engram` or POPS domain (`transaction`, `media`, `inventory`) |
| `title`     | string | Engram title or record description                            |
| `excerpt`   | string | Relevant passage from the source (max 200 characters)         |
| `relevance` | number | 0-1 similarity score from Thalamus retrieval                  |
| `scope`     | string | Primary scope of the cited source                             |

## API Surface

| Procedure                 | Input                                                                             | Output                              | Notes                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `cerebrum.query.ask`      | QueryRequest                                                                      | `{ result: QueryResponse }`         | Full pipeline: scope inference → retrieval → answer generation                           |
| `cerebrum.query.retrieve` | question: string, scopes?: string[], includeSecret?: boolean, maxSources?: number | `{ sources: SourceCitation[] }`     | Retrieval only — returns relevant sources without generating an answer                   |
| `cerebrum.query.explain`  | question: string                                                                  | `{ scopeInference, retrievalPlan }` | Debug endpoint — shows how scopes would be inferred and which sources would be retrieved |

## Business Rules

- Every answer must cite at least one source — if retrieval returns zero relevant results, the system responds with "I don't have information about that" rather than hallucinating
- Scope inference from the question uses keyword matching and context analysis: mentions of "work," project names, or professional topics filter to `work.*`; personal references filter to `personal.*`; ambiguous questions query all non-secret scopes
- The `.secret.*` hard-block applies at retrieval time — secret-scoped engrams are excluded from the Thalamus query unless `includeSecret: true` is explicitly passed
- Retrieval combines semantic search (embeddings via Thalamus) and structured queries (SQLite filters on type, tags, date ranges) — Thalamus handles the fusion
- Context assembly ranks retrieved sources by relevance score and truncates to fit within the LLM context window, preserving the highest-relevance sources
- The LLM prompt instructs the model to answer only from the provided context, cite sources by ID, and explicitly state when the available context is insufficient
- Source excerpts are extracted from the passage most relevant to the question, not the beginning of the engram
- Cross-domain queries (spanning engrams and POPS SQLite data) use the Thalamus cross-source index to retrieve both engram content and structured records (transactions, media, inventory)
- Confidence is derived from retrieval metrics: `high` when top sources have relevance > 0.8, `medium` for 0.5-0.8, `low` below 0.5
- Query latency target: answer generated within 3 seconds for a corpus of up to 100,000 engrams

## Edge Cases

| Case                                                     | Behaviour                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Question is empty or whitespace                          | Rejected — question is required                                                                  |
| No relevant sources found above relevance threshold      | Returns `{ answer: "I don't have information about that.", sources: [], confidence: "low" }`     |
| Question explicitly references a secret scope            | Rejected unless `includeSecret: true` — returns a message explaining the scope restriction       |
| Question spans multiple domains (engrams + transactions) | Thalamus cross-source index returns results from both domains, context assembly interleaves them |
| Question is ambiguous — could be personal or work        | Retrieves from all non-secret scopes, notes the ambiguity in the response                        |
| Retrieved context exceeds LLM context window             | Lowest-relevance sources are dropped until context fits within the window limit                  |
| Thalamus is unavailable                                  | Returns error with `{ available: false }` — does not attempt to answer without retrieval         |
| Question contains a date reference ("last Tuesday")      | Date is resolved to an absolute date for structured query filtering                              |
| Question references an engram by ID                      | Direct ID lookup bypasses semantic search — retrieves the specific engram                        |

## User Stories

| #   | Story                                                         | Summary                                                                     | Status      | Parallelisable   |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-natural-language-qa](us-01-natural-language-qa.md)     | Accept a question, retrieve context, generate grounded answer, cite sources | Not started | No (first)       |
| 02  | [us-02-scope-aware-retrieval](us-02-scope-aware-retrieval.md) | Infer scopes from question context, filter retrieval by inferred scopes     | Not started | Yes              |
| 03  | [us-03-source-attribution](us-03-source-attribution.md)       | Cite specific engrams in every answer with ID, title, excerpt, relevance    | Not started | Blocked by us-01 |
| 04  | [us-04-multi-domain](us-04-multi-domain.md)                   | Queries span engrams and POPS SQLite data via Thalamus cross-source index   | Not started | Blocked by us-01 |

US-02 can parallelise with US-01 (scope inference is a separable module). US-03 and US-04 depend on the core Q&A pipeline from US-01.

## Verification

- A natural language question about a known topic returns a grounded answer citing specific engrams by ID
- Asking "what did I decide about X?" retrieves decision-type engrams and generates an answer referencing the decision and its rationale
- A question mentioning "at work" filters retrieval to `work.*` scopes; a personal question filters to `personal.*`
- Secret-scoped engrams never appear in query results unless `includeSecret: true` is passed
- A cross-domain question like "what did I spend on that trip where I had the idea about X?" retrieves both transaction records and engrams
- When no relevant sources exist, the system responds with "I don't have information about that" rather than fabricating an answer
- The `explain` endpoint returns the scope inference and retrieval plan for debugging
- Every claim in the answer is traceable to a specific source citation with an excerpt

## Out of Scope

- Conversational multi-turn Q&A (Epic 05 — Ego manages conversation state)
- Answer caching or precomputation (future optimisation)
- Answer formatting for specific output media (PRD-083 handles document formatting)
- User feedback on answer quality (future — could feed into retrieval tuning)
- Streaming answer generation (future — initial implementation is request/response)

## Drift Check

last checked: never
