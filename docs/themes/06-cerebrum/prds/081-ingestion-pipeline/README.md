# PRD-081: Ingestion Pipeline

> Epic: [02 — Ingest](../../epics/02-ingest.md)
> Status: In progress

## Overview

Define the ingestion pipeline that accepts content from multiple input channels (manual shell capture, agent MCP/API, quick capture via Moltbot/CLI), normalises it, classifies the content type, matches a template, extracts entities, infers scopes, checks for duplicates, and writes an engram file. This is the single path from raw input to stored engram — every piece of knowledge enters Cerebrum through this pipeline.

**Capture-first principle.** Manual ingest defaults to a single body input — no type, template, scope, or tag decisions are required upfront. The user types or pastes content, hits submit, and the curation pipeline infers structure asynchronously. Explicit metadata is available behind an "Advanced" disclosure for users who want full control. The bar is "as fast as a sticky note." Notion-style up-front classification is an anti-pattern for this PRD.

## Data Model

### Pipeline Stages

The ingestion pipeline is a sequential processor with defined stage boundaries:

```
raw input → normalize → classify type → match template → extract entities → infer scopes → deduplicate check → write engram
```

### Ingestion Request

| Field          | Type     | Required | Description                                                         |
| -------------- | -------- | -------- | ------------------------------------------------------------------- |
| `body`         | string   | Yes      | Raw content — Markdown, plain text, or structured JSON              |
| `title`        | string   | No       | Explicit title — inferred from body H1 or first line if absent      |
| `type`         | string   | No       | Explicit type — if absent, Cortex classifies from content           |
| `scopes`       | string[] | No       | Explicit scopes — if absent, inferred via rules + LLM               |
| `tags`         | string[] | No       | Explicit tags — augmented by entity extraction                      |
| `template`     | string   | No       | Explicit template — if absent, matched from classified type         |
| `source`       | string   | Yes      | Input channel: `manual`, `agent`, `moltbot`, `cli`, `plexus:{name}` |
| `customFields` | object   | No       | Template-specific fields (e.g., `mood`, `outcome`, `decision`)      |

### Normalisation Output

| Field      | Type   | Description                                                           |
| ---------- | ------ | --------------------------------------------------------------------- |
| `body`     | string | Cleaned Markdown — trimmed whitespace, normalised line endings, UTF-8 |
| `title`    | string | Resolved title                                                        |
| `metadata` | object | All explicit fields from the request, preserved for later stages      |

## API Surface

| Procedure                         | Input                                                        | Output                               | Notes                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cerebrum.ingest.submit`          | IngestionRequest                                             | `{ engram: Engram }`                 | Full pipeline — normalise, classify, extract, scope, write                                                                                                   |
| `cerebrum.ingest.preview`         | IngestionRequest                                             | `{ preview: IngestionPreview }`      | Dry run — returns classification, scopes, entities without writing                                                                                           |
| `cerebrum.ingest.classify`        | body: string, type?: string                                  | `{ type, confidence, template }`     | Classification only — Cortex type inference                                                                                                                  |
| `cerebrum.ingest.extractEntities` | body: string                                                 | `{ entities: Entity[] }`             | Entity extraction only — people, projects, dates, topics                                                                                                     |
| `cerebrum.ingest.inferScopes`     | body: string, source: string, tags?: string[], type?: string | `{ scopes: ScopeInference[] }`       | Scope inference only — rules first, LLM second                                                                                                               |
| `cerebrum.ingest.quickCapture`    | text: string, source?: string, scopes?: string[]             | `{ engram: Engram }`                 | Minimal-friction shortcut — assigns `type: capture`, skips classification. `scopes` are treated as suggestions and reconciled by the curation worker (US-10) |
| `cerebrum.scopes.reconcile`       | suggestedScopes: string[]                                    | `{ suggestions: ScopeSuggestion[] }` | Pure lexical/structural reconciliation of suggested scopes against the index — no LLM, no write (US-10)                                                      |

### MCP Tools

| Tool                     | Parameters                          | Description                                           |
| ------------------------ | ----------------------------------- | ----------------------------------------------------- |
| `cerebrum_ingest`        | body, title?, type?, scopes?, tags? | Full ingestion via MCP — used by Claude Code sessions |
| `cerebrum_quick_capture` | text                                | Quick capture via MCP — raw text in, engram out       |

## Business Rules

- Every ingestion request must include a `body` and a `source` — all other fields are optional and inferred if absent
- Normalisation runs first: trim leading/trailing whitespace, normalise line endings to `\n`, ensure valid UTF-8, strip null bytes
- If `title` is absent, the pipeline extracts it from the first H1 heading (`# Title`) or falls back to the first line of the body (truncated to 100 characters)
- If `type` is explicitly provided, classification is skipped — the explicit type is trusted
- If `type` is absent, Cortex classifies from the body content. If classification confidence is below the threshold (configurable, default 0.6), the type falls back to `capture`
- Template matching uses the classified type to look up a template by name. If no matching template exists, the engram is created without template scaffolding
- Entity extraction runs on the body content regardless of explicit tags — extracted entities are merged with any explicit tags (deduplicating)
- Scope inference follows the three-tier priority from [ADR-020](../../../../architecture/adr-020-hierarchical-scope-model.md): (1) explicit user scopes always win, (2) `scope-rules.toml` pattern matching, (3) LLM-based classification as fallback. If all three produce no scopes, the fallback scope from `scope-rules.toml` is assigned
- Deduplication checks the content hash (SHA-256 of normalised body) against the `engram_index.content_hash` column. If a duplicate is found, the pipeline rejects the submission and returns the existing engram ID
- After all stages complete, the pipeline calls `cerebrum.engrams.create` to write the file and index entry
- Quick capture bypasses classification, entity extraction, and scope inference — it assigns `type: capture`, `source: moltbot` (or provided source), and either the user-suggested scopes (when provided) or the fallback scope. Cortex reclassifies it asynchronously later
- User-suggested scopes via `quickCapture` are written to the engram immediately as the active scopes (so retrieval works straight away) and the curation worker runs scope reconciliation (US-10) against the existing scope index. Reconciliation results are written to `_scope_suggestions` for the post-ingest review (US-07) to surface — they do not auto-rewrite the engram's scopes
- Hard-explicit scope semantics (PRD-081 US-06 Tier 1, never reconciled) remain available only via `cerebrum.ingest.submit`. The manual capture surface always uses suggestion semantics, regardless of whether Advanced is open
- The `preview` endpoint runs the full pipeline but stops before writing — useful for UI confirmation dialogs
- Manual capture from the shell defaults to `quickCapture` regardless of body length — async enrichment is the path of least friction. The full `submit` pipeline runs only when the user opens the Advanced disclosure and provides at least one explicit field (type, scopes, tags, template, or custom fields)
- Bulk paste with `---` (a line containing only three hyphens) splits the body into N segments client-side and submits each segment as its own `quickCapture` mutation, in order. Empty segments are skipped silently
- A retry-enrichment mutation re-enqueues the `classifyEngram` job for a given engram id; the job handler is idempotent via the `_enrichedHash` custom field

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body is empty string                                                   | Rejected — body is required and must contain at least one non-whitespace character                                                                   |
| Body contains only whitespace                                          | Rejected — same as empty body after normalisation                                                                                                    |
| Body is valid JSON (structured data)                                   | Normalised to Markdown: JSON rendered as a fenced code block with metadata extracted into frontmatter fields                                         |
| Title exceeds 200 characters                                           | Truncated to 200 characters at the nearest word boundary                                                                                             |
| Explicit type does not match any template                              | Engram created with the explicit type but no template scaffolding — warning logged                                                                   |
| Classification returns multiple candidate types                        | Highest-confidence type is selected; if tied, `capture` is used                                                                                      |
| Entity extraction returns zero entities                                | No tags added from extraction — explicit tags are preserved                                                                                          |
| Scope rules and LLM both produce empty scopes                          | Fallback scope from `scope-rules.toml` is assigned                                                                                                   |
| Duplicate content hash detected                                        | Submission rejected with `{ duplicate: true, existingId: string }` — no new file written                                                             |
| MCP tool called with invalid parameters                                | Returns structured error with field-level validation messages                                                                                        |
| Ingestion during Thalamus downtime                                     | File is written to disk, index sync deferred until Thalamus recovers                                                                                 |
| Body contains frontmatter-like `---` fences                            | Content body is preserved as-is — only the engram's own frontmatter is generated by the pipeline                                                     |
| Source is `plexus:{name}` with unknown name                            | Accepted — source is a freeform string, plexus adapter validation is Plexus's responsibility                                                         |
| Bulk paste contains `---` inside a fenced code block                   | Splitter operates on raw lines; a `---` inside ```fences still splits. Users wrap with HTML comments or escape if literal`---` is needed in body     |
| Capture-mode submit happens while Redis is down                        | Engram is written, enrichment job enqueue logs a warning, type stays `capture`; user can re-enqueue from the result view (US-07) once Redis recovers |
| Global capture hotkey (US-09) fires while a dialog is open             | Hotkey is suppressed — focus is inside the dialog's input or the dialog is itself a modal layer; hotkey resumes once the dialog closes               |
| Bulk paste segment fails one-of-N                                      | Remaining segments still process; failed segment shows in the result list with error and a per-segment retry action                                  |
| User suggests a scope that already exactly matches an indexed scope    | No reconciliation suggestion is produced; the user's scope stays as-is                                                                               |
| User suggests a scope no candidate matches above 0.6 confidence        | No reconciliation suggestion is produced; vocabulary grows naturally                                                                                 |
| Same canonical reconciliation was previously dismissed for this engram | Suggestion is suppressed for that engram (tracked via `_scope_suggestions_dismissed` segment-set keys)                                               |
| User suggests N scopes, M are reconciled                               | Each scope is reconciled independently; M suggestions surface in US-07, N − M chips show no "Did you mean" affordance                                |

## User Stories

| #   | Story                                                         | Summary                                                                                                              | Status      | Parallelisable    |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------- |
| 01  | [us-01-manual-input](us-01-manual-input.md)                   | Capture-first shell surface: single body input, async enrichment by default, Advanced disclosure for explicit fields | Done        | No (first)        |
| 02  | [us-02-agent-input](us-02-agent-input.md)                     | MCP tools and API endpoint for writing engrams from Claude Code or external tools                                    | Done        | Yes               |
| 03  | [us-03-quick-capture](us-03-quick-capture.md)                 | Minimal-friction capture for Moltbot/CLI: raw text in, classified later                                              | Done        | Yes               |
| 04  | [us-04-classification](us-04-classification.md)               | LLM-based content classification: infer type, match template, suggest tags                                           | Done        | Yes               |
| 05  | [us-05-entity-extraction](us-05-entity-extraction.md)         | Extract people, projects, dates, topics from body into tags and frontmatter                                          | Done        | Yes               |
| 06  | [us-06-scope-inference](us-06-scope-inference.md)             | Rule-based + LLM-based scope assignment with user override                                                           | Done        | Yes               |
| 07  | [us-07-post-ingest-review](us-07-post-ingest-review.md)       | After capture, surface inferred type/template/scopes/tags as editable chips; retry enrichment on failure             | Done        | Blocked by US-01  |
| 08  | [us-08-bulk-paste](us-08-bulk-paste.md)                       | Split pasted body on `---` lines into N engrams, each via `quickCapture`                                             | Done        | Yes (after US-01) |
| 09  | [us-09-global-capture-hotkey](us-09-global-capture-hotkey.md) | Single keyboard shortcut opens a capture modal anywhere in the shell                                                 | Not started | Yes (after US-01) |
| 10  | [us-10-scope-reconciliation](us-10-scope-reconciliation.md)   | Reconcile user-suggested scopes against the existing vocabulary; surface canonical alternatives in the review        | Done        | Yes               |

US-02 and US-03 define the agent and capture input channels and parallelise with US-01 (the manual shell surface). US-04, US-05, and US-06 define the pipeline processing stages and parallelise with each other and with the input channels. US-07, US-08, and US-09 extend the manual channel and depend on US-01's capture surface. US-10 is the reconciliation backbone for scope-as-suggestion semantics — US-01 surfaces it via `quickCapture`'s `scopes` argument, US-07 renders its results, and the two depend on it being implemented to deliver the canonical-scope flow end-to-end. All stories depend on PRD-077 (engram file format) and PRD-078 (scope model) being implemented.

## Verification

- A capture-mode submission with body only (no type, scopes, tags, or template) creates a `type: capture` engram in under 500 ms and enqueues a `classifyEngram` job
- An Advanced submission with explicit type runs the full `submit` pipeline and bypasses classification for that field; scopes from the manual surface always go through reconciliation regardless of the Advanced state
- A capture-mode submission of `karbon.meetings` when the index contains `work.karbon.fedx.meetings` (used 12+ times) writes `karbon.meetings` to the engram immediately, then the curation worker writes `_scope_suggestions: [{ original: "karbon.meetings", canonical: "work.karbon.fedx.meetings", confidence: 0.85, reason: "matches longer canonical scope" }]`, and US-07 renders the suggestion as a one-click chip update
- An API caller using `cerebrum.ingest.submit` with `scopes: ["my.fresh.scope"]` (no `_reconcile_scopes: true`) writes the scope as-is and no reconciliation runs — explicit-scope semantics from US-06 Tier 1 are preserved
- An MCP `cerebrum_ingest` call from a Claude Code session creates an engram with inferred classification and extracted entities
- A quick capture via Moltbot creates a `type: capture` engram in the `captures/` directory with the fallback scope
- A bulk paste of three segments separated by `---` produces three engrams, each with its own enrichment job, in submission order
- The post-ingest review view updates inferred type, template, scopes, and tags in place once the curation worker completes, without a manual refresh
- The global capture hotkey opens the capture modal from any route, and Cmd/Ctrl+Enter submits without closing the user's prior route
- Submitting the same content body twice (identical content hash) rejects the second submission and returns the existing engram ID
- Content without an explicit type is classified by Cortex — a meeting transcript is classified as `meeting`, a pro/con list as `decision`
- Entity extraction identifies people names, project names, and dates from the body and adds them as tags
- Scope inference assigns `work.projects` to content sourced from GitHub, `personal.captures` to content from Moltbot
- The `preview` endpoint returns classification, scopes, and entities without writing any file
- An engram created through the pipeline is immediately queryable via `cerebrum.engrams.list`

## Out of Scope

- Integration-specific adapters (Epic 07 — Plexus provides email, calendar, GitHub adapters that feed into this pipeline)
- Voice transcription (future — raw audio to text is a pre-processing step before ingestion)
- Bulk import tooling (future — one-time migration scripts for existing notes)
- Semantic embedding generation (PRD-079 — Thalamus handles embedding sync after the engram is written)
- Content curation or consolidation (PRD-085 — Glia operates on stored engrams, not during ingestion)
- Template creation or editing (PRD-077 — templates are managed outside the ingestion pipeline)

## Drift Check

last checked: 2026-05-14
