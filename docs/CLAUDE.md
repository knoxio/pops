# Documentation Standards

Rules and conventions for **all** documentation in `docs/` and in each pillar's `docs/`. Every doc MUST follow these standards.

`AGENTS.md` (repo root) is the single source of truth for repo conventions; the root `CLAUDE.md` points there. This file governs docs only.

## Hard Rules — Do Not Violate

| #   | Rule                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No ticket, no work.** Every piece of implementation MUST trace back to testable acceptance criteria. No exceptions — not for tooling, not for "quick fixes", not for "obvious" changes. The chain is non-negotiable: **PRD → testable acceptance criteria → Implementation**. |
| 2   | Acceptance criteria live **INLINE** in each PRD under `## Acceptance Criteria` as testable checkboxes. There is NO separate user-story doc type. This is the unit of completion.                                                                                                |
| 3   | Every theme has **at least one** PRD. Every PRD has **testable** acceptance criteria. If work has none, write them **before** starting.                                                                                                                                         |
| 4   | A PRD must include **everything** an agent needs to implement it (including its acceptance criteria). Each file is self-contained enough that an agent works from it + **at most one** parent doc. Keep cross-references minimal — no chasing a chain of docs.                  |
| 5   | **IDs are slug-only.** A doc's id is its slug + its path. NO PRD numbers, no counter, nothing to insert or renumber. Slugs are **lowercase, hyphen-separated, descriptive**.                                                                                                    |
| 6   | **ADRs keep `adr-NNN` numbering** — this sequence is FROZEN and append-only. New ADRs get the next number; existing numbers **NEVER** change.                                                                                                                                   |
| 7   | **Theme folders are slug-only** — NO numeric prefix.                                                                                                                                                                                                                            |
| 8   | Docs belonging to exactly **ONE** pillar live INSIDE that pillar under `pillars/<id>/docs/`. The central `docs/` tree holds **ONLY** cross-cutting material.                                                                                                                    |
| 9   | An ADR moves into a pillar **only** when referenced by that pillar alone. If a second pillar references it, promote it back to central `docs/architecture/`.                                                                                                                    |
| 10  | The **roadmap** (`docs/roadmap.md`) is the single source of truth for status across all pillars.                                                                                                                                                                                |
| 11  | On completing work, update **all four** status places (see [Status Sync](#keeping-docs-in-sync)). Status flows upward; never leave a place stale.                                                                                                                               |
| 12  | **Write as if no code exists** — every doc reads "build this", never "we migrated from X" / "this was refactored". No meta-commentary about the doc itself. No filler, no preamble.                                                                                             |
| 13  | **Keep files small.** A PRD over 3 pages MUST be narrowed in scope or split into multiple PRDs.                                                                                                                                                                                 |

## Doc Types

Hierarchy: **Theme → PRD**, with **ADR** cross-cutting (referenced by any level). `Epic` is an OPTIONAL grouping file — use only when a theme has enough PRDs to need intermediate organisation. It is not part of the required spine; a theme may point straight at its PRDs.

| Type                  | Location                              | Purpose                                                           | Size & contents                                                                                                                                                               | Template                     |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Theme**             | `themes/<slug>/README.md`             | Strategic overview of a domain — _what_ and _why_ at a high level | ~1 page. Lists its PRDs with status (and epics, if used); key decisions, risks, out of scope. **No implementation details.**                                                  | `_templates/theme-readme.md` |
| **PRD**               | `themes/<slug>/prds/<slug>/README.md` | Detailed spec for a feature/deliverable — enough to build from    | ~2-3 pages max. Data model, API surface, business rules, edge cases; general direction on _how_ to build (not step-by-step); `## Acceptance Criteria` as testable checkboxes. | `_templates/prd.md`          |
| **Epic** _(optional)_ | `themes/<slug>/epics/<slug>.md`       | A buildable chunk grouping several related PRDs                   | ~1 page. Lists PRDs with dependencies & parallelisation notes; scope boundaries (in/out). **No detailed specs — that's the PRD's job.**                                       | `_templates/epic.md`         |
| **ADR**               | `architecture/adr-NNN-slug.md`        | Architecture Decision Record — a technical choice and why         | ~1 page. Context, options considered, decision, consequences; referenced by themes/PRDs where relevant.                                                                       | `_templates/adr.md`          |

## Folder Structure

```
docs/                                ← cross-cutting material ONLY
├── README.md                        ← start here
├── CLAUDE.md                        ← this file
├── vision.md
├── roadmap.md
├── ideas/
├── _templates/
├── runbooks/                        ← e.g. shared cut-release runbook
├── architecture/
│   └── adr-NNN-slug.md              ← ADRs referenced by >1 pillar
└── themes/
    ├── README.md                    ← theme index
    ├── platform/                    ← the three central themes
    │   ├── README.md                ← theme overview
    │   ├── epics/<slug>.md          ← optional
    │   └── prds/<slug>/README.md    ← PRD (criteria inline)
    ├── foundation/ …
    └── federation/ …
```

The central themes are **`platform`, `foundation`, `federation`**. The central `docs/` tree holds only cross-cutting material: those three themes, ADRs referenced by more than one pillar, the shared `cut-release` runbook, templates, `vision.md`, and `roadmap.md`.

### Pillar-Scoped Docs

Docs belonging to exactly one pillar mirror the central layout inside the pillar:

```
pillars/<id>/
├── README.md                        ← technical package readme (@pops/<id>) — NOT a theme doc
└── docs/
    ├── README.md                    ← domain/theme overview
    ├── prds/<slug>/README.md        ← PRD (criteria inline)
    ├── epics/<slug>.md              ← optional grouping
    ├── architecture/adr-NNN-slug.md ← ADRs scoped to this pillar only
    ├── runbooks/
    └── ideas/                       ← when applicable
```

- A pillar's `docs/README.md` is the **domain overview**. The package `README.md` (`# @pops/<id>`) is the **technical** readme and stays separate.
- Cross-pillar references use relative paths between pillar docs (e.g. `../../../<other>/docs/...`). References to central docs reach back into `docs/` (e.g. `../../../../docs/architecture/adr-NNN-slug.md`).

## Naming Conventions

| Type         | Pattern                       | Example                                       |
| ------------ | ----------------------------- | --------------------------------------------- |
| Theme folder | `<slug>/`                     | `platform/`, `foundation/`, `federation/`     |
| Epic file    | `<slug>.md`                   | `cicd-pipelines.md`, `database-operations.md` |
| PRD folder   | `<slug>/`                     | `app-theme-colour-propagation/`, `plex-sync/` |
| PRD file     | `README.md` inside PRD folder | `prds/app-theme-colour-propagation/README.md` |
| ADR          | `adr-NNN-slug.md`             | `adr-006-tailwind-only-styling.md`            |

Pick a clear, descriptive slug; the folder path supplies theme/pillar context. (ID and numbering hard rules: see [Hard Rules](#hard-rules--do-not-violate) #5–#7.)

## Writing Rules

**General** (hard rules #12–#13 apply):

- Use **tables over prose** for structured information.

**For AI agent context** (hard rule #4 applies):

- Reference parent docs by relative path at the **top** of each file.

**Statuses** — use consistently across all doc types:

| Status      | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| To Review   | Exists in docs but not yet validated against implementation |
| Not started | Validated — no work done                                    |
| In progress | Actively being worked on                                    |
| Partial     | Some parts done, some not (specify what's missing)          |
| Done        | Complete and verified                                       |

**Cross-references:**

- Reference ADRs by filename: `See [ADR-004](../../../../architecture/adr-004-api-domain-modules.md)`.
- Reference themes / PRDs by relative path from the current file.
- The roadmap implementation tracker is the single source of truth for overall status.

## Keeping Docs in Sync

When work completes (a PRD finishes, a theme wraps up), update **all four** status places. Status flows upward:

```
All criteria checked → PRD done
PRD done → Theme checks its PRDs → all done? → Theme done
Any status change → update the roadmap tracker
```

| #   | Place                                           | Action                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Acceptance criteria checkboxes** (in the PRD) | Mark each `- [ ]` as `- [x]` when it passes. All checked → PRD is done.                                                                                                                                                                                             |
| 2   | **PRD status**                                  | When every checkbox is ticked, move the PRD's own status `In progress` → `Done`.                                                                                                                                                                                    |
| 3   | **Theme PRD table**                             | Update the PRD's status where the theme tracks it: central themes use a `## PRD Index` table; pillar themes (which use epics) track PRD status in each epic file's `## PRDs` table. A theme is `Done` when all its PRDs are done.                                   |
| 4   | **Roadmap (current-state tracker)**             | Reflect the change in `docs/roadmap.md` (the top-level view: `## Today` / `## In progress` / `## Forward`). Also update `## Current State` in `docs/README.md` if the change affects the high-level summary (e.g. a new app becomes functional, a phase completes). |

**Division of responsibility:** an agent finishing a PRD updates places 1–3 (criteria, PRD status, theme's PRD table). The roadmap tracker (place 4) and root README are updated when a **theme's** status changes.

## What Doesn't Belong in Docs

- Implementation details (file paths, function names, import statements) — that's the code's job.
- Framework-specific instructions (how to use React hooks, ts-rest patterns) — that's `CLAUDE.md` / `AGENTS.md` in the repo root.
- Anything that duplicates what `git log` or `git blame` already tells you.
- Meeting notes, scratch work, or conversation logs.
