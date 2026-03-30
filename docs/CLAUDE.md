# Documentation Standards

Rules and conventions for all documentation in `docs/`. Every doc must follow these standards.

## Doc Types

POPS documentation uses five doc types arranged in a hierarchy:

```
Theme → Epic → PRD → User Story
                         ↑
         ADR (cross-cutting, referenced by any level)
```

### Theme (`themes/<name>/README.md`)

Strategic overview of a domain. Defines *what* and *why* at a high level.

- ~1 page
- Lists epics with status
- Key decisions, risks, out of scope
- No implementation details
- Template: [_templates/theme-readme.md](_templates/theme-readme.md)

### Epic (`themes/<name>/epics/NN-slug.md`)

A buildable chunk of work. Defines scope, coordination, and what PRDs fall under it.

- ~1 page
- Lists PRDs with dependencies and parallelisation notes
- Scope boundaries (what's in, what's out)
- No detailed specs — that's the PRD's job
- Template: [_templates/epic.md](_templates/epic.md)

### PRD (`themes/<name>/prds/NNN-slug/README.md`)

Detailed spec for a feature or deliverable. Enough detail to build from.

- ~2-3 pages max
- Data model, API surface, business rules, edge cases
- General direction on how to build (not step-by-step instructions)
- Lists user stories with parallelisation notes
- Template: [_templates/prd.md](_templates/prd.md)

### User Story (`themes/<name>/prds/NNN-slug/us-NN-slug.md`)

Single implementable unit. An AI agent or developer picks up one file and builds it.

- ~0.5 page
- One clear deliverable
- Acceptance criteria (testable)
- References parent PRD for context
- Designed to be parallelisable — minimise dependencies between stories
- Template: [_templates/us.md](_templates/us.md)

### ADR (`architecture/adr-NNN-slug.md`)

Architecture Decision Record. Documents a technical choice and why it was made.

- ~1 page
- Context, options considered, decision, consequences
- Referenced by themes/epics/PRDs where relevant
- Template: [_templates/adr.md](_templates/adr.md)

## Folder Structure

```
docs/
├── README.md                        ← start here
├── CLAUDE.md                        ← this file
├── vision.md
├── roadmap.md
├── ideas/
├── _templates/
├── architecture/
│   └── adr-NNN-slug.md
└── themes/
    ├── README.md                    ← theme index
    └── NN-<name>/
        ├── README.md                ← theme overview
        ├── epics/
        │   └── NN-slug.md
        └── prds/
            └── NNN-slug/
                ├── README.md        ← PRD
                ├── us-01-slug.md
                └── us-02-slug.md
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Theme folder | `NN-<name>/` | `00-infrastructure/`, `01-foundation/`, `03-media/` |
| Epic file | `NN-slug.md` | `00-data-model.md`, `03-connections-graph.md` |
| PRD folder | `NNN-slug/` | `007-app-theme-colour-propagation/`, `015-plex-sync/` |
| PRD file | `README.md` inside PRD folder | `prds/007-app-theme-colour-propagation/README.md` |
| User story | `us-NN-slug.md` | `us-01-search-movies.md`, `us-03-poster-cache.md` |
| ADR | `adr-NNN-slug.md` | `adr-006-tailwind-only-styling.md` |

- Epic numbers are sequential within their theme (restart per theme)
- US numbers are sequential within their PRD (restart per PRD)
- **PRD numbers are global and append-only** — new PRDs get the next number regardless of which theme they belong to. Never insert, never renumber. The folder path provides theme/epic context, the number is just a unique ID
- Slugs are lowercase, hyphen-separated, descriptive

## The Ticket Rule

**No ticket, no work.** Every piece of implementation must trace back to a user story with acceptance criteria. No exceptions — not for tooling, not for "quick fixes", not for "obvious" changes.

The chain is non-negotiable:

```
Epic → PRD → User Story (with acceptance criteria) → Implementation
```

- Every epic must have at least one PRD
- Every PRD must have at least one user story
- Every user story must have testable acceptance criteria
- If work doesn't have a US, create one before starting

## Writing Rules

### General

- Write as if no code exists. Every doc should read as "build this", never "we migrated from X" or "this was refactored"
- No meta-commentary about the document itself ("This document describes...", "These are product descriptions...")
- No filler, no preamble. Lead with the content
- Use tables over prose for structured information
- Keep files small. If a PRD exceeds 3 pages, split into more user stories or break into multiple PRDs

### For AI Agent Context

- Each file should be self-contained enough that an agent can work with it + at most one parent doc for context
- User stories must include everything an agent needs to implement them — don't rely on the agent reading the full PRD
- Reference parent docs by relative path at the top of each file
- Keep cross-references minimal — an agent shouldn't need to chase a chain of 4 docs to understand what to build

### Statuses

Use these consistently across all doc types:

| Status | Meaning |
|--------|---------|
| To Review | Exists in docs but not yet validated against implementation |
| Not started | Validated — no work done |
| In progress | Actively being worked on |
| Partial | Some parts done, some not (specify what's missing) |
| Done | Complete and verified |

### Cross-References

- Reference ADRs by filename: `See [ADR-004](../../architecture/adr-004-tailwind-only-styling.md)`
- Reference epics/PRDs by relative path from the current file
- The roadmap implementation tracker is the single source of truth for overall status

## Keeping Docs in Sync With Implementation

When implementation work completes (a US is built, a PRD is finished, an epic wraps up), update all places that track status. There are exactly four:

### 1. User Story — acceptance criteria checkboxes
Mark each `- [ ]` criterion as `- [x]` when it passes. When all criteria are checked, the US is done.

### 2. PRD — user story table
Update the story's status in the PRD's `## User Stories` table from `Not started` → `In progress` → `Done`.

### 3. Epic — PRD table
Update the PRD's status in the epic's `## PRDs` table. A PRD is `Done` when all its user stories are done.

### 4. Theme README — epic table
Update the epic's status in the theme's `## Epics` table. An epic is `Done` when all its PRDs are done.

### 5. Roadmap — implementation tracker
Update the corresponding row in `roadmap.md` under `## Implementation Tracker`. This is the top-level view.

### 6. Docs root README — current state
Update the `## Current State` section in `docs/README.md` if the change affects the high-level summary (e.g., a new app becomes functional, a phase completes).

### Status flows upward

```
US done → PRD checks its stories → all done? → PRD done
PRD done → Epic checks its PRDs → all done? → Epic done
Epic done → Theme checks its epics → all done? → Theme done
Any status change → update the roadmap tracker
```

An agent finishing a US should update levels 1-3 (the US, its parent PRD table, and the epic table if the PRD is now complete). The roadmap tracker (level 5) and root README (level 6) should be updated when an epic's status changes.

## What Doesn't Belong in Docs

- Implementation details (file paths, function names, import statements) — that's the code's job
- Framework-specific instructions (how to use React hooks, tRPC patterns) — that's CLAUDE.md in the repo root
- Anything that duplicates what `git log` or `git blame` already tells you
- Meeting notes, scratch work, or conversation logs
