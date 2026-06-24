# Documentation Standards

Rules and conventions for all documentation in `docs/` and in each pillar's `docs/`. Every doc must follow these standards.

## Doc Types

POPS documentation uses a small set of doc types arranged in a hierarchy:

```
Theme → PRD
          ↑
   ADR (cross-cutting, referenced by any level)
```

Acceptance criteria live **inline in each PRD** under `## Acceptance Criteria`. There is no separate user-story doc type.

`Epic` exists only as an optional grouping file when a theme has enough PRDs to warrant intermediate organisation. It is not part of the required spine — a theme can point straight at its PRDs.

### Theme (`themes/<slug>/README.md`)

Strategic overview of a domain. Defines _what_ and _why_ at a high level.

- ~1 page
- Lists its PRDs with status (and epics, if the theme uses them)
- Key decisions, risks, out of scope
- No implementation details
- Template: [\_templates/theme-readme.md](_templates/theme-readme.md)

### PRD (`themes/<slug>/prds/<slug>/README.md`)

Detailed spec for a feature or deliverable. Enough detail to build from, with its acceptance criteria inline.

- ~2-3 pages max
- Data model, API surface, business rules, edge cases
- General direction on how to build (not step-by-step instructions)
- `## Acceptance Criteria` — testable checkboxes; this is the unit of completion
- Template: [\_templates/prd.md](_templates/prd.md)

### Epic (`themes/<slug>/epics/<slug>.md`) — optional

A buildable chunk of work that groups several related PRDs. Use it only when a theme is large enough to need it.

- ~1 page
- Lists PRDs with dependencies and parallelisation notes
- Scope boundaries (what's in, what's out)
- No detailed specs — that's the PRD's job
- Template: [\_templates/epic.md](_templates/epic.md)

### ADR (`architecture/adr-NNN-slug.md`)

Architecture Decision Record. Documents a technical choice and why it was made.

- ~1 page
- Context, options considered, decision, consequences
- Referenced by themes / PRDs where relevant
- Template: [\_templates/adr.md](_templates/adr.md)

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
    ├── platform/
    │   ├── README.md                ← theme overview
    │   ├── epics/                   ← optional
    │   │   └── <slug>.md
    │   └── prds/
    │       └── <slug>/
    │           └── README.md        ← PRD (criteria inline)
    ├── foundation/
    │   └── …
    └── federation/
        └── …
```

The central themes are `platform`, `foundation`, and `federation`. Theme folders are slug-only — no numeric prefix.

## Pillar-Scoped Docs

Documentation that belongs to exactly one pillar lives **inside that pillar**, under `pillars/<id>/docs/`, mirroring the central layout:

```
pillars/<id>/
├── README.md                        ← technical package readme (@pops/<id>) — NOT a theme doc
└── docs/
    ├── README.md                    ← domain/theme overview (the former theme README)
    ├── prds/
    │   └── <slug>/
    │       └── README.md            ← PRD (criteria inline)
    ├── epics/                        ← optional grouping
    │   └── <slug>.md
    ├── architecture/                ← ADRs scoped to this pillar only
    │   └── adr-NNN-slug.md
    ├── runbooks/
    └── ideas/                        ← when applicable
```

The central `docs/` tree holds only **cross-cutting** material: the `platform` / `foundation` / `federation` themes, ADRs referenced by more than one pillar, the shared `cut-release` runbook, templates, `vision.md`, and `roadmap.md`.

Rules:

- A pillar's `docs/README.md` is the domain overview. The package `README.md` (`# @pops/<id>`) is the technical readme and stays separate.
- An ADR moves into a pillar only when it is referenced by that pillar alone. If a second pillar starts referencing it, promote it back to central `docs/architecture/`.
- Cross-pillar references use relative paths between pillar docs (e.g. `../../../<other>/docs/...`); references to central docs reach back into `docs/` (e.g. `../../../../docs/architecture/adr-NNN-slug.md`).
- The roadmap implementation tracker remains the single source of truth for status across all pillars.

## Naming Conventions

| Type         | Pattern                       | Example                                       |
| ------------ | ----------------------------- | --------------------------------------------- |
| Theme folder | `<slug>/`                     | `platform/`, `foundation/`, `federation/`     |
| Epic file    | `<slug>.md`                   | `cicd-pipelines.md`, `database-operations.md` |
| PRD folder   | `<slug>/`                     | `app-theme-colour-propagation/`, `plex-sync/` |
| PRD file     | `README.md` inside PRD folder | `prds/app-theme-colour-propagation/README.md` |
| ADR          | `adr-NNN-slug.md`             | `adr-006-tailwind-only-styling.md`            |

- **IDs are slug-only.** A doc's unique id is its slug plus its path — there are no PRD numbers, no append-only counter, nothing to insert or renumber. Pick a clear, descriptive slug and the folder path supplies theme/pillar context.
- **ADRs keep `adr-NNN` numbering** — this sequence is frozen and append-only. New ADRs get the next number; existing numbers never change.
- Slugs are lowercase, hyphen-separated, descriptive.

## The Ticket Rule

**No ticket, no work.** Every piece of implementation must trace back to testable acceptance criteria. No exceptions — not for tooling, not for "quick fixes", not for "obvious" changes.

The chain is non-negotiable:

```
PRD → testable acceptance criteria → Implementation
```

Acceptance criteria live **inline in the PRD** under `## Acceptance Criteria` as testable checkboxes.

- Every theme has at least one PRD.
- Every PRD has testable acceptance criteria.
- If work doesn't have acceptance criteria, write them before starting.

## Writing Rules

### General

- Write as if no code exists. Every doc should read as "build this", never "we migrated from X" or "this was refactored"
- No meta-commentary about the document itself ("This document describes...", "These are product descriptions...")
- No filler, no preamble. Lead with the content
- Use tables over prose for structured information
- Keep files small. If a PRD exceeds 3 pages, narrow its scope or split it into multiple PRDs

### For AI Agent Context

- Each file should be self-contained enough that an agent can work with it + at most one parent doc for context
- A PRD must include everything an agent needs to implement it — including its acceptance criteria
- Reference parent docs by relative path at the top of each file
- Keep cross-references minimal — an agent shouldn't need to chase a chain of docs to understand what to build

### Statuses

Use these consistently across all doc types:

| Status      | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| To Review   | Exists in docs but not yet validated against implementation |
| Not started | Validated — no work done                                    |
| In progress | Actively being worked on                                    |
| Partial     | Some parts done, some not (specify what's missing)          |
| Done        | Complete and verified                                       |

### Cross-References

- Reference ADRs by filename: `See [ADR-004](../../../../architecture/adr-004-api-domain-modules.md)`
- Reference themes / PRDs by relative path from the current file
- The roadmap implementation tracker is the single source of truth for overall status

## Keeping Docs in Sync With Implementation

When implementation work completes (a PRD is finished, a theme wraps up), update every place that tracks status. There are four:

### 1. Acceptance criteria checkboxes

Mark each `- [ ]` criterion as `- [x]` when it passes. When all of a PRD's criteria are checked, the PRD is done.

### 2. PRD status

When every checkbox is ticked, move the PRD's own status from `In progress` → `Done`.

### 3. Theme README — PRD table

Update the PRD's status in the theme's `## PRDs` table (and the epic's row in `## Epics`, if the theme uses epics). A theme is `Done` when all its PRDs are done.

### 4. Roadmap — implementation tracker

Update the corresponding row in `roadmap.md` under `## Implementation Tracker`. This is the top-level view. Also update the `## Current State` section in `docs/README.md` if the change affects the high-level summary (e.g., a new app becomes functional, a phase completes).

### Status flows upward

```
All criteria checked → PRD done
PRD done → Theme checks its PRDs → all done? → Theme done
Any status change → update the roadmap tracker
```

An agent finishing a PRD updates levels 1-3 (the criteria, the PRD status, and the theme's PRD table). The roadmap tracker (level 4) and root README are updated when a theme's status changes.

## What Doesn't Belong in Docs

- Implementation details (file paths, function names, import statements) — that's the code's job
- Framework-specific instructions (how to use React hooks, ts-rest patterns) — that's CLAUDE.md / AGENTS.md in the repo root
- Anything that duplicates what `git log` or `git blame` already tells you
- Meeting notes, scratch work, or conversation logs
