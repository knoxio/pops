# Engram File Format & CRUD

> Status: Done — file format, templates, SQLite index, CRUD service, and REST surface are all shipped. The dead-architecture provisioning story (`/opt/pops/engrams`, Ansible, rclone+age, `.config/` toml seeding, `pops cerebrum reindex` CLI) is not built — see [ideas/engram-directory-provisioning.md](../../ideas/engram-directory-provisioning.md).

Every piece of knowledge in Cerebrum is an **engram**: a Markdown file with YAML frontmatter on disk, mirrored into the cerebrum pillar's own SQLite index for fast querying. The filesystem is the source of truth; the index is a regenerable cache. This PRD defines the file format, the template system, the index schema, the CRUD service, and the REST surface. Engrams (and their scopes/tags/links) live in the cerebrum pillar's SQLite DB alongside plexus, glia, and conversations.

The engram root resolves from `CEREBRUM_ENGRAMS_DIR`, defaulting to `{cwd}/data/engrams`.

## Engram File Format

A `.md` file with a YAML frontmatter block (`---` fences), parsed/serialized with `gray-matter` over a `js-yaml` `JSON_SCHEMA` engine (timestamps stay strings, preserving the author's timezone offset):

```markdown
---
id: eng_20260417_0942_agent-coordination
type: research
scopes: [work.projects.karbon, personal.learning]
created: 2026-04-17T09:42:00+10:00
modified: 2026-04-17T14:30:00+10:00
source: manual
tags: [agents, coordination]
links: [eng_20260415_0900_llm-routing]
status: active
template: research
---

# Agent Coordination Landscape

Body in Markdown…
```

### Frontmatter Schema (`engramFrontmatterSchema`, Zod)

| Field      | Type     | Required | Rule                                                                    |
| ---------- | -------- | -------- | ----------------------------------------------------------------------- |
| `id`       | string   | Yes      | matches `eng_{YYYYMMDD}_{HHmm}_{slug}` (`^eng_\d{8}_\d{4}_[a-z0-9-]+$`) |
| `type`     | string   | Yes      | non-empty; the file's type subfolder                                    |
| `scopes`   | string[] | Yes      | at least one, each non-empty                                            |
| `created`  | string   | Yes      | ISO-8601 with timezone (`Z` or `±HH:MM`)                                |
| `modified` | string   | Yes      | ISO-8601 with timezone; rewritten on every write                        |
| `source`   | string   | Yes      | `manual \| agent \| moltbot \| cli` or `plexus:{name}` prefix           |
| `tags`     | string[] | No       | each non-empty                                                          |
| `links`    | string[] | No       | each a valid engram id                                                  |
| `status`   | enum     | Yes      | `active \| archived \| consolidated \| stale`                           |
| `template` | string   | No       | template name used at creation                                          |

The schema is `.passthrough()` — template-defined custom fields survive on the frontmatter and are split out into the index `custom_fields` JSON by key (anything outside the known-key set).

- [x] `parseEngramFile(content)` → `{ frontmatter, body }`, throwing a typed `EngramParseError` on malformed YAML or schema failure.
- [x] `serializeEngram(frontmatter, body)` validates, orders keys for readable diffs (known keys first, custom keys sorted), trims the body to a single trailing newline.
- [x] `deriveTitle(body)` = first H1, else first non-empty line, else `Untitled`. `countWords(body)` counts whitespace-delimited tokens of the body only.
- [x] Status transitions enforced at the service layer (`canTransitionStatus`): `active → archived|consolidated|stale`; `archived → active`; `consolidated` and `stale` are terminal.

### ID Generation

- [x] `eng_{YYYYMMDD}_{HHmm}_{slug}`; the slug is the title NFKD-normalized, diacritics stripped, lowercased, non-alphanumerics collapsed to hyphens, trimmed, max 40 chars; empty → `untitled`.
- [x] Collision on disk **or** in the index appends a counter suffix (`_2`, `_3`, …) via the caller-supplied `isTaken` probe.
- [x] File path is `{type}/{id}.md`. `type` is validated (`assertSafeType`) as a short lowercase segment; the well-known dirs (`.archive`, `.templates`, `.config`, `.index`) and `engrams` are rejected as types.

## Template System

Templates are read-only `.md` files (frontmatter + Markdown body) loaded from disk by `TemplateRegistry` at boot, re-scannable via `reload()`. The default set ships at `templates/defaults/` and is the seed directory (`CEREBRUM_TEMPLATES_DIR` overrides).

- [x] Default templates exist: `journal`, `decision`, `research`, `meeting`, `idea`, `note`, `capture` (capture is the minimal/no-required-field fallback).
- [x] Template frontmatter (`templateFrontmatterSchema`): `name`, `description` (both required), optional `required_fields`, `suggested_sections`, `default_scopes`, and `custom_fields` (a record of `{ type, description }` where `type ∈ string|number|boolean|string[]|number[]|boolean[]`). Files failing the schema are skipped with a warning, not fatal.
- [x] `TemplateRegistry` exposes `list()` (sorted by name) and `get(name)`.
- [x] Applying a template at create time (`applyTemplate`): merges `default_scopes` ahead of caller scopes (deduped); rejects with a 400 when any `required_field` is missing; scaffolds the body from `suggested_sections` as `## Heading` blocks when no body is supplied; replaces `{{placeholder}}` markers (including `{{title}}`) from supplied values, leaving unknown markers intact; validates custom fields against their declared types and projects only declared fields onto the frontmatter.
- [x] Creating with a `template` that does not exist logs a warning and falls back to a `capture`-type engram with no scaffolding.

## SQLite Index

Mirrors frontmatter so queries never touch disk. The filesystem stays source of truth; the index is rebuildable.

`engram_index`: `id` (PK), `file_path` (not null, unique), `type`, `source`, `status` (all not null), `template` (nullable), `created_at`, `modified_at`, `title`, `content_hash` (all not null), `body_hash` (nullable — SHA-256 of body only, used for embedding-staleness detection), `word_count` (int, not null), `custom_fields` (nullable JSON text). Indexes on `type`, `source`, `status`, `created_at`, `content_hash`, `body_hash`.

Junction tables, each with a composite-unique pair index plus a standalone lookup index:

- `engram_scopes(engram_id FK→engram_index.id ON DELETE CASCADE, scope)` — unique `(engram_id, scope)`, index `scope` for prefix queries.
- `engram_tags(engram_id FK→engram_index.id ON DELETE CASCADE, tag)` — unique `(engram_id, tag)`, index `tag`.
- `engram_links(source_id FK→engram_index.id ON DELETE CASCADE, target_id)` — unique `(source_id, target_id)`, index `target_id` for reverse lookups. **`target_id` deliberately has no FK** so frontmatter can reference a not-yet-indexed engram.

- [x] All tables defined as Drizzle schemas with the columns, indexes, cascades, and the `target_id` no-FK exception above.

## REST API Surface

Served under the cerebrum contract on the docker-network trust boundary (no per-request auth). Typed/array inputs ride POST/PATCH bodies; `get`/`delete` carry only the id in the path; links are a sub-resource of the source engram.

| Method & Path                               | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `POST /engrams`                             | Create (optionally template-scaffolded) → `{ engram }`           |
| `GET /engrams/:id`                          | Read frontmatter projection + Markdown body → `{ engram, body }` |
| `PATCH /engrams/:id`                        | Update title/body/scopes/tags/status/template → `{ engram }`     |
| `DELETE /engrams/:id`                       | **Archive** (soft delete) → `{ success: true }`                  |
| `POST /engrams/search`                      | List with filters + total → `{ engrams, total }`                 |
| `POST /engrams/:sourceId/links`             | Bidirectional link → `{ success: true }`                         |
| `DELETE /engrams/:sourceId/links/:targetId` | Remove link → `{ success: true }`                                |
| `GET /templates`                            | List templates (bodies stripped) → `{ templates }`               |
| `GET /templates/:name`                      | Get one template incl. body → `{ template }` or 404              |

- [x] `POST /engrams` body: `{ type, title, body?, scopes? (min 1 when present), tags?, template?, customFields?, source?, links? }`. `source` is a free string at the edge, validated server-side against the source grammar → 400 on a bad channel.
- [x] `POST /engrams/search` body: `{ type?, scopes?, tags?, ids?, status?, search?, limit? (≤500), offset?, sort? }` where `sort = { field: created_at|modified_at|title, direction: asc|desc }`. Queries the index, never the filesystem. `search` is a case-insensitive substring `LIKE` on `title`; default sort `modified_at desc`, default limit 50. Returns the matched page plus an unpaginated `total`.
- [x] Invalid input is rejected by the contract's Zod schemas as a typed error, not an unhandled throw; `NotFoundError → 404`, `ValidationError → 400` via the shared error mapper.
- [x] `templates.get` 404s on an unknown name.

The fs→index `reindex` lives on the `cerebrum.index.*` contract (`POST /index/reindex`), with `POST /index/reconcile` (dry-run-able disk↔index diff surfacing `missing`/`orphaned`) and `GET /index/status` — not on the engrams sub-router.

## CRUD Service Behaviour

`EngramService` takes `{ root, db, templates }` (plus optional `scopeRuleEngine`, `now`) by injection. Reads resolve through the pillar data-access layer; writes route through FS-coupled handlers.

- [x] **create** generates the id, then in a single DB transaction upserts the index rows and atomically writes the `.md` file — a failure on either side rolls back both, leaving no orphan row or file. Requires at least one scope from the caller, a template's `default_scopes`, or an injected scope engine, else 400.
- [x] **read** looks up the file path from the index, reads + parses the file, returns frontmatter projection + body; 404 when the id is absent from the index.
- [x] **update** re-reads the file, merges changes, rewrites `modified`, validates any status transition, writes the file atomically, then re-syncs the index (including scopes/tags/links/custom fields). A title change rewrites the body's H1.
- [x] **archive** (the `DELETE` route) moves the file to `.archive/{type}/{id}.md`, sets `status: archived`, updates `file_path` — files are never physically removed. Idempotent on an already-archived engram.
- [x] **link/unlink** are bidirectional: the link is written into both engrams' frontmatter `links` arrays and both `engram_links` rows; when the target is not indexed, only the source side is mutated and the single forward row is inserted. Self-links are rejected.
- [x] Every file write stores a SHA-256 `content_hash` (full file) and a `body_hash` (body only) plus the body `word_count` in the index.
- [x] **reindex** walks all `.md` files under the root (excluding the well-known dot-dirs), parses each, and rebuilds the entire index inside one transaction (drop-all, re-insert); files that fail to parse are skipped with a warning, never deleted.

Service-level extras beyond the original CRUD scope, all exercised by tests: `restore(id)` (inverse of archive, idempotent), `hardDelete(id)` (removes file + index row, cascades link rows, strips inbound references from other engrams' frontmatter), and `changeType(id, newType)` (moves the file to a new type folder, preserving the id so links stay valid).

## Business & Edge-Case Rules

- [x] Unknown/omitted `type` falls back to `capture`.
- [x] A referenced-but-missing template → engram created without scaffolding, warning logged.
- [x] Duplicate id → counter suffix.
- [x] Empty body is valid (metadata-only engrams).
- [x] Frontmatter parse error during (re)indexing → file skipped, logged, preserved on disk.
- [x] `disk↔index` drift is surfaced by `POST /index/reconcile`: files on disk but absent from the index are `missing` (synced); index rows whose file is gone are `orphaned` (marked, not deleted). A live chokidar watcher (opt-in via `CEREBRUM_INDEX_WATCH`) performs the same reconciliation on startup scan.

## Out of Scope

- Semantic search / embeddings, scope inference, ingestion, curation/consolidation — owned by sibling cerebrum PRDs.
- On-host directory provisioning, OS permissions, backup pipeline, and a CLI reindex command — see the idea file linked at the top.
