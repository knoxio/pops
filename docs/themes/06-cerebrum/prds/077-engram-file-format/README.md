# PRD-077: Engram File Format & Directory Structure

> Epic: [00 — Engram Storage](../../epics/00-engram-storage.md)
> Status: Not started

## Overview

Define the canonical engram file format (Markdown with YAML frontmatter), the template system for content types, the directory layout on the server, and the CRUD service and API for managing engrams. Every piece of knowledge in Cerebrum is an engram file — this PRD defines what that file looks like, where it lives, and how the system reads and writes it.

## Data Model

### Engram File Format

Every engram is a `.md` file with YAML frontmatter:

```markdown
---
id: eng_20260417_0942_agent-coordination
type: research
scopes: [work.projects.karbon, personal.learning]
created: 2026-04-17T09:42:00+10:00
modified: 2026-04-17T14:30:00+10:00
source: manual
tags: [agents, coordination, langgraph]
links: [eng_20260415_llm-routing, eng_20260410_langgraph-notes]
status: active
template: research
---

# Agent Coordination Landscape

Content body in Markdown...
```

### Frontmatter Schema

| Field      | Type     | Required | Description                                                         |
| ---------- | -------- | -------- | ------------------------------------------------------------------- |
| `id`       | string   | Yes      | Unique identifier: `eng_{date}_{time}_{slug}`                       |
| `type`     | string   | Yes      | Classification hint — matched to a template name or `capture`       |
| `scopes`   | string[] | Yes      | Hierarchical dot-notation scope tags (at least one)                 |
| `created`  | string   | Yes      | ISO 8601 timestamp with timezone                                    |
| `modified` | string   | Yes      | ISO 8601 timestamp, updated on every write                          |
| `source`   | string   | Yes      | Input channel: `manual`, `agent`, `moltbot`, `cli`, `plexus:{name}` |
| `tags`     | string[] | No       | Freeform topic tags for structured filtering                        |
| `links`    | string[] | No       | IDs of related engrams (bidirectional — link A→B implies B→A)       |
| `status`   | string   | Yes      | Lifecycle: `active`, `archived`, `consolidated`, `stale`            |
| `template` | string   | No       | Template used to create this engram                                 |

Templates may add additional typed fields to the frontmatter (e.g., `mood` for journal entries, `outcome` for decisions, `project` for meeting notes). These are defined per-template and indexed by Thalamus for structured queries.

### Template System

Templates live in `engrams/.templates/`:

```markdown
---
name: decision
description: A decision made with rationale and outcome tracking
required_fields: [decision, alternatives]
suggested_sections: [Context, Decision, Alternatives, Rationale, Outcome]
default_scopes: []
custom_fields:
  decision: { type: string, description: "The decision that was made" }
  alternatives: { type: string[], description: "Options that were considered" }
  outcome: { type: string, description: "Result of the decision" }
  confidence: { type: string, description: "low | medium | high" }
---

# {{title}}

## Context

{{Why this decision needed to be made}}

## Decision

{{What was decided}}

## Alternatives

{{What else was considered}}

## Rationale

{{Why this option was chosen}}

## Outcome

_To be filled in after the decision plays out._
```

### Directory Structure

```
/opt/pops/engrams/
├── .templates/              ← engram type templates
│   ├── journal.md
│   ├── decision.md
│   ├── research.md
│   ├── meeting.md
│   ├── idea.md
│   ├── note.md
│   └── capture.md           ← minimal template for unstructured input
├── .config/
│   ├── scope-rules.toml     ← rule-based scope inference
│   ├── glia.toml             ← curation thresholds and trust state
│   └── reflexes.toml         ← automation trigger definitions
├── .archive/                 ← engrams archived by Glia (never deleted)
├── .index/                   ← Thalamus metadata cache (regenerable)
├── journal/                  ← organized by type
├── decisions/
├── research/
├── meetings/
├── ideas/
├── notes/
└── captures/                 ← unclassified input, classified later
```

### SQLite Index Table (engram_index)

| Column        | Type    | Constraints      | Description                           |
| ------------- | ------- | ---------------- | ------------------------------------- |
| id            | TEXT    | PK               | Engram ID (matches frontmatter `id`)  |
| file_path     | TEXT    | NOT NULL, UNIQUE | Relative path from engram root        |
| type          | TEXT    | NOT NULL         | Classification type                   |
| source        | TEXT    | NOT NULL         | Input channel                         |
| status        | TEXT    | NOT NULL         | Lifecycle status                      |
| template      | TEXT    |                  | Template name if used                 |
| created_at    | TEXT    | NOT NULL         | ISO 8601                              |
| modified_at   | TEXT    | NOT NULL         | ISO 8601                              |
| title         | TEXT    | NOT NULL         | First H1 heading or first line        |
| content_hash  | TEXT    | NOT NULL         | SHA-256 of file content               |
| word_count    | INTEGER | NOT NULL         | Body word count                       |
| custom_fields | TEXT    |                  | JSON of template-specific frontmatter |

**Indexes:** `type`, `source`, `status`, `created_at`, `content_hash`

### engram_scopes (junction table)

| Column    | Type | Constraints                    | Description       |
| --------- | ---- | ------------------------------ | ----------------- |
| engram_id | TEXT | FK → engram_index.id, NOT NULL | Engram reference  |
| scope     | TEXT | NOT NULL                       | Full scope string |

**Indexes:** Composite `(engram_id, scope)` unique, `scope` for prefix queries

### engram_tags (junction table)

| Column    | Type | Constraints                    | Description      |
| --------- | ---- | ------------------------------ | ---------------- |
| engram_id | TEXT | FK → engram_index.id, NOT NULL | Engram reference |
| tag       | TEXT | NOT NULL                       | Tag string       |

**Indexes:** Composite `(engram_id, tag)` unique, `tag`

### engram_links (junction table)

| Column    | Type | Constraints                    | Description      |
| --------- | ---- | ------------------------------ | ---------------- |
| source_id | TEXT | FK → engram_index.id, NOT NULL | Linking engram   |
| target_id | TEXT | NOT NULL                       | Linked engram ID |

**Indexes:** Composite `(source_id, target_id)` unique, `target_id` for reverse lookups

## API Surface

| Procedure                 | Input                                                           | Output                             | Notes                                    |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `cerebrum.engrams.create` | type, title, body, scopes?, tags?, template?, customFields?     | `{ engram: Engram }`               | Creates file + index entry               |
| `cerebrum.engrams.get`    | id                                                              | `{ engram: Engram, body: string }` | Reads file, returns full content         |
| `cerebrum.engrams.update` | id, title?, body?, scopes?, tags?, customFields?, status?       | `{ engram: Engram }`               | Updates file + index. Modified timestamp |
| `cerebrum.engrams.delete` | id                                                              | `{ success: boolean }`             | Moves to .archive/, updates index status |
| `cerebrum.engrams.list`   | type?, scopes?, tags?, status?, search?, limit?, offset?, sort? | `{ engrams: Engram[], total }`     | Queries index table, not filesystem      |
| `cerebrum.engrams.link`   | sourceId, targetId                                              | `{ success: boolean }`             | Bidirectional link (updates both files)  |
| `cerebrum.engrams.unlink` | sourceId, targetId                                              | `{ success: boolean }`             | Remove bidirectional link                |
| `cerebrum.templates.list` | —                                                               | `{ templates: Template[] }`        | Lists available templates                |
| `cerebrum.templates.get`  | name                                                            | `{ template: Template }`           | Returns template definition              |

## Business Rules

- Every engram has a unique ID generated at creation: `eng_{YYYYMMDD}_{HHmm}_{slug}`
- File path is derived from type: `{type}/{id}.md` (e.g., `journal/eng_20260417_0942_morning.md`)
- Creating an engram writes the file first, then indexes it — the file is always the source of truth
- Deleting an engram moves the file to `.archive/` and sets `status: archived` in the index — files are never physically deleted
- Templates are optional — creating an engram without a template produces a `capture` type with minimal frontmatter
- The `modified` timestamp updates on every write, including link changes
- Links are bidirectional — linking A to B also records B linking to A in both files' frontmatter
- Custom fields from templates are stored as JSON in the index's `custom_fields` column for structured queries
- The index is regenerable — `pops cerebrum reindex` rebuilds it from the engram files

## Edge Cases

| Case                                  | Behaviour                                                            |
| ------------------------------------- | -------------------------------------------------------------------- |
| Engram created with unknown type      | Falls back to `capture` type, Cortex classifies later                |
| Template referenced but doesn't exist | Engram created without template, warning logged                      |
| Duplicate ID (extremely unlikely)     | Append counter suffix: `eng_20260417_0942_morning_2`                 |
| File exists but not in index          | Detected by Thalamus file watcher, added to index                    |
| Index entry exists but file missing   | Marked as `status: orphaned`, logged for investigation               |
| Engram body is empty                  | Valid — some engrams are metadata-only (e.g., a link-only reference) |
| Frontmatter parse error               | File skipped during indexing, error logged, file preserved           |

## User Stories

| #   | Story                                                     | Summary                                                                                     | Status      | Parallelisable          |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| 01  | [us-01-file-format](us-01-file-format.md)                 | Define and validate the engram file format — frontmatter schema, ID generation, file naming | Not started | No (first)              |
| 02  | [us-02-template-system](us-02-template-system.md)         | Template files, registry, template-based engram creation with field validation              | Not started | Blocked by us-01        |
| 03  | [us-03-directory-structure](us-03-directory-structure.md) | Server-side directory layout, permissions, Ansible provisioning, backup integration         | Not started | Yes                     |
| 04  | [us-04-index-schema](us-04-index-schema.md)               | Drizzle schema for engram_index, engram_scopes, engram_tags, engram_links tables            | Not started | Yes                     |
| 05  | [us-05-crud-service](us-05-crud-service.md)               | Service layer for engram CRUD — file operations + index sync, link management               | Not started | Blocked by us-01, us-04 |
| 06  | [us-06-api-procedures](us-06-api-procedures.md)           | tRPC procedures for all engram and template operations                                      | Not started | Blocked by us-05        |

US-03 and US-04 can parallelise with each other and with US-02. US-05 depends on both the file format (us-01) and the index schema (us-04). US-06 wraps the service layer.

## Verification

- An engram created via the API produces a valid Markdown file with correct frontmatter
- The same engram is queryable via `cerebrum.engrams.list` with type, scope, and tag filters
- Deleting an engram moves it to `.archive/` — the file is never physically deleted
- `pops cerebrum reindex` rebuilds the index from files and produces identical query results
- Templates produce engrams with the expected frontmatter fields and suggested sections
- Bidirectional links update both source and target engram files
- The engram directory is backed up by the existing rclone+age pipeline
- Engram files are human-readable — opening one in any text editor shows comprehensible content

## Out of Scope

- Semantic search or embedding generation (PRD-079, PRD-076)
- Scope inference or auto-classification (PRD-078, PRD-081)
- File watching and automatic index sync (PRD-079)
- Content curation or consolidation (PRD-085)

## Drift Check

last checked: never
