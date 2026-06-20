# PRD-083: Document Generation

> Epic: [03 — Emit](../../epics/03-emit.md)
> Status: Done

## Overview

Define the document generation system that produces structured output documents (reports, summaries, timelines) from engram data and POPS records. All generated documents are scope-filtered and audience-aware — the system declares the output's audience scope and hard-blocks `*.secret.*` content unless the user explicitly opts in. This PRD builds on the retrieval and grounding patterns from PRD-082 (Query Engine).

## Data Model

### Generation Request

| Field           | Type     | Required | Description                                                                    |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------ |
| `mode`          | string   | Yes      | Output mode: `report`, `summary`, `timeline`                                   |
| `query`         | string   | No       | Topic or question to generate from — required for `report`                     |
| `dateRange`     | object   | No       | `{ from: ISO8601, to: ISO8601 }` — required for `summary`, optional for others |
| `scopes`        | string[] | No       | Explicit scope filter — if absent, inferred from query/topic                   |
| `audienceScope` | string   | No       | Intended audience scope (e.g., `work.*`) — controls what content is included   |
| `includeSecret` | boolean  | No       | Opt-in for `*.secret.*` content (default: `false`)                             |
| `types`         | string[] | No       | Filter engrams by type (e.g., `decision`, `meeting`)                           |
| `tags`          | string[] | No       | Filter engrams by tags                                                         |
| `format`        | string   | No       | Output format: `markdown` (default), `plain`                                   |

### Generated Document

| Field           | Type             | Description                                                   |
| --------------- | ---------------- | ------------------------------------------------------------- |
| `title`         | string           | Generated document title                                      |
| `body`          | string           | Full document content in the requested format                 |
| `mode`          | string           | Generation mode used                                          |
| `sources`       | SourceCitation[] | All engrams and records referenced (same schema as PRD-082)   |
| `audienceScope` | string           | The audience scope applied                                    |
| `dateRange`     | object           | The date range covered (explicit or derived)                  |
| `metadata`      | object           | Generation metadata: source count, date range, scope coverage |

## API Surface

| Procedure                        | Input                                                                 | Output                                           | Notes                                                             |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `cerebrum.emit.generate`         | GenerationRequest                                                     | `{ document: GeneratedDocument }`                | Full generation pipeline: retrieve, synthesise, format            |
| `cerebrum.emit.generateReport`   | query: string, scopes?, audienceScope?, includeSecret?, types?, tags? | `{ document: GeneratedDocument }`                | Shorthand for `generate({ mode: "report", ... })`                 |
| `cerebrum.emit.generateSummary`  | dateRange, scopes?, audienceScope?, includeSecret?, types?, tags?     | `{ document: GeneratedDocument }`                | Shorthand for `generate({ mode: "summary", ... })`                |
| `cerebrum.emit.generateTimeline` | scopes?, dateRange?, audienceScope?, includeSecret?, types?, tags?    | `{ document: GeneratedDocument }`                | Shorthand for `generate({ mode: "timeline", ... })`               |
| `cerebrum.emit.preview`          | GenerationRequest                                                     | `{ sources: SourceCitation[], outline: string }` | Dry run — returns sources and document outline without generating |

## Business Rules

- Every generated document has an `audienceScope` — if not explicitly provided, it defaults to the broadest non-secret scope among the retrieved sources
- The `*.secret.*` hard-block is enforced at generation time: engrams in any `*.secret.*` scope are excluded from retrieval and document content unless `includeSecret: true` is explicitly passed
- An engram with both secret and non-secret scopes is treated as secret — the most restrictive scope wins (consistent with PRD-078)
- Reports are structured documents with sections (introduction, body sections grouped by subtopic, conclusion) generated from retrieved engrams matching the query
- Summaries aggregate engrams over a date range: they group content by type or topic and produce a digestible overview (e.g., "weekly digest," "monthly review," "topic summary")
- Timelines produce chronological sequences from dated engrams: each entry includes the date, title, and a one-line summary, with optional grouping by type
- Source attribution follows the same pattern as PRD-082 — every section of the generated document references the engrams it drew from
- The LLM prompt for generation instructs the model to synthesise (not copy) from the provided sources, maintain the audience scope's tone and context, and never introduce information not present in the sources
- If retrieval returns fewer than 2 sources for a report, the system responds with a notice that insufficient data exists rather than generating a thin document
- Summaries with zero engrams in the date range return an empty summary with a note: "No engrams found in the specified date range"
- Generated documents are returned as strings — they are not stored as engrams unless the user explicitly saves them

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report query matches zero engrams                                      | Returns `{ document: null, notice: "No relevant engrams found for this query" }`                                                                   |
| Summary date range has zero engrams                                    | Returns an empty summary with a note explaining the empty range                                                                                    |
| Timeline with only one engram                                          | Returns a single-entry timeline — valid but noted as minimal                                                                                       |
| `audienceScope` is `work.*` but retrieved engrams include `personal.*` | Personal-scoped engrams are excluded from the document — only `work.*` content is included                                                         |
| `includeSecret: true` with `audienceScope: work.*`                     | Secret work content (`work.secret.*`) is included; secret personal content (`personal.secret.*`) is still excluded by the `work.*` audience filter |
| Date range `from` is after `to`                                        | Rejected — invalid date range                                                                                                                      |
| Engram body is empty (metadata-only)                                   | Included in timeline (date + title) but excluded from report/summary synthesis                                                                     |
| LLM generation fails or times out                                      | Returns error with retrieved sources so the user can inspect them manually                                                                         |
| Very large result set (100+ engrams for a summary)                     | Sources are ranked by relevance and capped at 50 — summary covers the most relevant content                                                        |

## User Stories

| #   | Story                                                         | Summary                                                                       | Status | Parallelisable   |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-report-generation](us-01-report-generation.md)         | Generate structured reports from a query or topic with sections and citations | Done   | No (first)       |
| 02  | [us-02-summary-generation](us-02-summary-generation.md)       | Generate summaries over time ranges or topics: weekly digest, monthly review  | Done   | Blocked by us-01 |
| 03  | [us-03-timeline-generation](us-03-timeline-generation.md)     | Generate chronological timelines from dated engrams with optional grouping    | Done   | Blocked by us-01 |
| 04  | [us-04-scope-filtered-output](us-04-scope-filtered-output.md) | All generated documents respect audience scope and hard-block secret content  | Done   | Yes              |

US-01 establishes the core generation pipeline (retrieval, synthesis, formatting) that US-02 and US-03 extend with mode-specific behaviour. US-04 is the scope filtering layer and can parallelise with US-01 since it is a cross-cutting concern applied to all modes.

## Verification

- A report generated for "agent coordination decisions" retrieves decision-type engrams about agent coordination and produces a structured document with sections and source citations
- A weekly summary for `work.*` scopes produces a digest grouped by type (meetings, decisions, research) covering the specified date range
- A timeline of decisions over the last 6 months produces a chronological list with dates, titles, and summaries
- A report with `audienceScope: work.*` never includes personal-scoped engrams in its content or citations
- Secret-scoped engrams are excluded from all generated documents unless `includeSecret: true` is passed
- An engram with scopes `[work.projects.karbon, personal.secret.therapy]` is excluded from any document generated without `includeSecret: true`
- Generating a summary for a date range with zero engrams returns an empty summary with an explanatory note
- The `preview` endpoint returns the sources and outline without generating the full document
- Every section of a generated report traces back to at least one source citation

## Out of Scope

- Presentation rendering or PDF export (future enhancement)
- Document storage as engrams (future — user can manually save if desired)
- Automated scheduled report generation (Epic 06 — Reflex triggers generation)
- Template-based output formatting (future — initial output is Markdown only)
- Collaborative document editing (single-user system)

## Drift Check

last checked: 2026-04-17
