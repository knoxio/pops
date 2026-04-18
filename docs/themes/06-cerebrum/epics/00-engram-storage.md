# Epic 00: Engram Storage

> Theme: [Cerebrum](../README.md)

## Scope

Define the engram file format, template system, directory structure, and scope model. Implement CRUD operations for engrams as an API module in pops-api. After this epic, engrams can be created, read, updated, deleted, listed, and filtered by scope — all via tRPC procedures. The engram directory exists on the server with correct permissions, backup integration, and security boundaries.

## PRDs

| #   | PRD                                                                        | Summary                                                                                    | Status      |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| 077 | [Engram File Format & Directory](../prds/077-engram-file-format/README.md) | File format spec, YAML frontmatter schema, template system, directory layout, CRUD service | Done        |
| 078 | [Scope Model](../prds/078-scope-model/README.md)                           | Hierarchical dot-notation scopes, scope rules, filtering, secret scope protection          | Not started |

PRD-077 must complete before PRD-078 — scopes are stored in engram frontmatter, so the file format must be defined first.

## Dependencies

- **Requires:** Infrastructure Epic 08 (Cortex Infrastructure — vector storage schema, Redis for caching)
- **Unlocks:** Epic 01 (Thalamus needs engrams to index), Epic 02 (Ingest needs a storage target)

## Out of Scope

- Indexing and search (Epic 01 — Thalamus)
- Content ingestion pipeline (Epic 02 — Ingest)
- Scope-aware output filtering (Epic 03 — Emit)
- Curation of engrams (Epic 04 — Glia)
