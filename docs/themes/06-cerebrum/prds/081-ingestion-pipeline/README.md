# PRD-081: Ingestion Pipeline

> Epic: [02 — Ingest](../../epics/02-ingest.md)
> Status: In progress

## Overview

Define the ingestion pipeline that accepts content from multiple input channels (manual shell form, agent MCP/API, quick capture via Moltbot/CLI), normalises it, classifies the content type, matches a template, extracts entities, infers scopes, checks for duplicates, and writes an engram file. This is the single path from raw input to stored engram — every piece of knowledge enters Cerebrum through this pipeline.

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

| Procedure                         | Input                                                        | Output                           | Notes                                                                     |
| --------------------------------- | ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------- |
| `cerebrum.ingest.submit`          | IngestionRequest                                             | `{ engram: Engram }`             | Full pipeline — normalise, classify, extract, scope, write                |
| `cerebrum.ingest.preview`         | IngestionRequest                                             | `{ preview: IngestionPreview }`  | Dry run — returns classification, scopes, entities without writing        |
| `cerebrum.ingest.classify`        | body: string, type?: string                                  | `{ type, confidence, template }` | Classification only — Cortex type inference                               |
| `cerebrum.ingest.extractEntities` | body: string                                                 | `{ entities: Entity[] }`         | Entity extraction only — people, projects, dates, topics                  |
| `cerebrum.ingest.inferScopes`     | body: string, source: string, tags?: string[], type?: string | `{ scopes: ScopeInference[] }`   | Scope inference only — rules first, LLM second                            |
| `cerebrum.ingest.quickCapture`    | text: string, source?: string                                | `{ engram: Engram }`             | Minimal-friction shortcut — assigns `type: capture`, skips classification |

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
- Scope inference follows the three-tier priority from ADR-020: (1) explicit user scopes always win, (2) `scope-rules.toml` pattern matching, (3) LLM-based classification as fallback. If all three produce no scopes, the fallback scope from `scope-rules.toml` is assigned
- Deduplication checks the content hash (SHA-256 of normalised body) against the `engram_index.content_hash` column. If a duplicate is found, the pipeline rejects the submission and returns the existing engram ID
- After all stages complete, the pipeline calls `cerebrum.engrams.create` to write the file and index entry
- Quick capture bypasses classification, entity extraction, and scope inference — it assigns `type: capture`, `source: moltbot` (or provided source), and the fallback scope. Cortex reclassifies it asynchronously later
- The `preview` endpoint runs the full pipeline but stops before writing — useful for UI confirmation dialogs

## Edge Cases

| Case                                            | Behaviour                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Body is empty string                            | Rejected — body is required and must contain at least one non-whitespace character                           |
| Body contains only whitespace                   | Rejected — same as empty body after normalisation                                                            |
| Body is valid JSON (structured data)            | Normalised to Markdown: JSON rendered as a fenced code block with metadata extracted into frontmatter fields |
| Title exceeds 200 characters                    | Truncated to 200 characters at the nearest word boundary                                                     |
| Explicit type does not match any template       | Engram created with the explicit type but no template scaffolding — warning logged                           |
| Classification returns multiple candidate types | Highest-confidence type is selected; if tied, `capture` is used                                              |
| Entity extraction returns zero entities         | No tags added from extraction — explicit tags are preserved                                                  |
| Scope rules and LLM both produce empty scopes   | Fallback scope from `scope-rules.toml` is assigned                                                           |
| Duplicate content hash detected                 | Submission rejected with `{ duplicate: true, existingId: string }` — no new file written                     |
| MCP tool called with invalid parameters         | Returns structured error with field-level validation messages                                                |
| Ingestion during Thalamus downtime              | File is written to disk, index sync deferred until Thalamus recovers                                         |
| Body contains frontmatter-like `---` fences     | Content body is preserved as-is — only the engram's own frontmatter is generated by the pipeline             |
| Source is `plexus:{name}` with unknown name     | Accepted — source is a freeform string, plexus adapter validation is Plexus's responsibility                 |

## User Stories

| #   | Story                                                 | Summary                                                                                                  | Status      | Parallelisable |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| 01  | [us-01-manual-input](us-01-manual-input.md)           | Shell UI form for creating engrams: type selector, template fields, body editor, scope picker, tag input | Not started | No (first)     |
| 02  | [us-02-agent-input](us-02-agent-input.md)             | MCP tools and API endpoint for writing engrams from Claude Code or external tools                        | Partial     | Yes            |
| 03  | [us-03-quick-capture](us-03-quick-capture.md)         | Minimal-friction capture for Moltbot/CLI: raw text in, classified later                                  | Partial     | Yes            |
| 04  | [us-04-classification](us-04-classification.md)       | LLM-based content classification: infer type, match template, suggest tags                               | Done        | Yes            |
| 05  | [us-05-entity-extraction](us-05-entity-extraction.md) | Extract people, projects, dates, topics from body into tags and frontmatter                              | Done        | Yes            |
| 06  | [us-06-scope-inference](us-06-scope-inference.md)     | Rule-based + LLM-based scope assignment with user override                                               | Done        | Yes            |

US-01, US-02, and US-03 define the three input channels and can parallelise. US-04, US-05, and US-06 define the pipeline processing stages and can parallelise with each other and with the input channels. All stories depend on PRD-077 (engram file format) and PRD-078 (scope model) being implemented.

## Verification

- A manual shell form submission with explicit type, scopes, and tags produces a correctly formatted engram file at the expected path
- An MCP `cerebrum_ingest` call from a Claude Code session creates an engram with inferred classification and extracted entities
- A quick capture via Moltbot creates a `type: capture` engram in the `captures/` directory with the fallback scope
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

last checked: 2026-04-17
