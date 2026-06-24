# POPS Documentation

## What is POPS?

POPS (Personal Operations System) is a self-hosted platform that manages finances, home inventory, media tracking, recipes, lists, contacts, and more — presented through a single shell over a federation of independent REST pillars, each owning its own SQLite database. It runs on a home server behind Cloudflare Tunnel with zero port forwarding.

See [vision.md](vision.md) for the full design philosophy.

## Reading Order

1. **[Vision](vision.md)** — Why POPS exists, design principles, strategy
2. **[Roadmap](roadmap.md)** — Phases, pillar priority, implementation tracker
3. **[Themes](themes/README.md)** — Cross-cutting initiatives (Platform, Foundation, Federation)
4. **[Architecture](architecture/)** — ADRs for cross-pillar technical decisions
5. **Pillar docs** — Per-pillar overview, PRDs, and ADRs under `pillars/<id>/docs/`

## Doc Structure

POPS docs split into two trees: **central** docs for cross-cutting concerns, and **pillar-scoped** docs that live inside the pillar they describe.

```
docs/                            ← central, cross-cutting docs only
├── README.md                ← you are here
├── CLAUDE.md                ← standards, rules, templates
├── vision.md                ← why, principles, strategy
├── roadmap.md               ← phases, sequencing, implementation tracker
├── ideas/                   ← brainstorm — not committed to
├── _templates/              ← templates for each doc type
├── runbooks/                ← shared, cross-pillar runbooks (e.g. cut-release)
├── architecture/            ← ADRs referenced by more than one pillar
│   └── adr-NNN-slug.md
└── themes/                  ← the three central themes
    ├── README.md            ← theme index
    ├── platform/            ← packaging, CI/CD, runtime, DB ops
    ├── foundation/          ← shell, UI, REST contract, manifest/plugin model
    └── federation/          ← registry, cross-pillar contracts, SDK, detachment
        ├── README.md        ← theme overview
        ├── epics/           ← optional grouping
        │   └── <slug>.md
        └── prds/
            └── <slug>/
                └── README.md    ← detailed spec (acceptance criteria inline)

pillars/<id>/                    ← one folder per pillar
├── README.md                ← technical package readme (# @pops/<id>)
├── manifest.ts              ← contract + registration metadata
├── app/                     ← pillar frontend (mounted in the shell)
└── docs/                    ← this pillar's domain docs
    ├── README.md            ← domain overview (the former theme README)
    ├── epics/               ← optional grouping
    │   └── <slug>.md
    ├── prds/
    │   └── <slug>/
    │       └── README.md    ← detailed spec (acceptance criteria inline)
    ├── architecture/        ← ADRs scoped to this pillar alone
    │   └── adr-NNN-slug.md
    ├── runbooks/  ideas/    ← when applicable
    └── plans/  specs/       ← when applicable
```

A pillar's `docs/README.md` is the domain overview. The package `README.md` (`# @pops/<id>`) is the technical readme and stays separate. Theme, epic, and PRD ids are **slug-only** — a doc's unique id is its slug plus its path, with nothing to insert or renumber. ADRs keep their frozen `adr-NNN` numbering (append-only). See [CLAUDE.md](CLAUDE.md) for the full layout, naming, and sync rules.

## Doc Types

| Type                | What it is                                            | Where it lives                                                                |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Theme**           | Cross-cutting initiative overview, lists its PRDs     | `themes/<slug>/README.md` (central) or `pillars/<id>/docs/README.md`          |
| **PRD**             | Detailed spec — data model, API, edge cases, criteria | `<theme-or-pillar>/.../prds/<slug>/README.md`                                 |
| **Epic** (optional) | Groups several related PRDs when a theme is large     | `themes/<slug>/epics/<slug>.md` or `pillars/<id>/docs/epics/<slug>.md`        |
| **ADR**             | Architecture decision and its rationale               | `architecture/adr-NNN-slug.md` (central) or `pillars/<id>/docs/architecture/` |

The required spine is **Theme → PRD**, with acceptance criteria **inline** in each PRD under `## Acceptance Criteria`. There is no separate User Story doc type. An **Epic** is an optional grouping file, used only when a theme has enough PRDs to warrant intermediate organisation; a theme can point straight at its PRDs. ADRs are cross-cutting and referenced by any level.

See [CLAUDE.md](CLAUDE.md) for templates and standards.

## Current State

POPS is a working multi-pillar REST platform. There is no tRPC, no `pops-api` monolith, no shared `pops.db` — each pillar owns its database, serves a ts-rest + zod contract (Rust pillars use axum + OpenAPI), exports a `manifest`, and self-registers with the **registry** pillar at runtime. Federation is complete end-to-end: the registry is the sole source of truth for the running fleet, with no static compiled pillar list.

**Data pillars** (each owns a SQLite DB and serves a contract):

| Pillar        | Port | Domain                                                             |
| ------------- | ---- | ------------------------------------------------------------------ |
| **registry**  | 3001 | Runtime pillar registry — self-registration, discovery, the fleet  |
| **inventory** | 3002 | Home inventory — connectivity graph, locations, photos, receipts   |
| **media**     | 3003 | Movies and TV tracking, preference learning, Plex/Radarr/Sonarr    |
| **finance**   | 3004 | Budgeting, transactions, wishlist, bank imports, AI categorisation |
| **food**      | 3005 | Recipes, ingredients, meal prep, multimodal ingestion              |
| **lists**     | 3006 | Lists and list items across domains                                |
| **cerebrum**  | 3007 | Personal cognitive infrastructure — engrams, retrieval, curation   |
| **ai**        | 3008 | AI usage tracking, model config, categorisation rules              |

**Other pillars:**

| Pillar           | Port | Role                                                                                                                |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| **contacts**     | 3010 | Rust pillar (axum + OpenAPI) — contacts / CRM-lite                                                                  |
| **orchestrator** | 3009 | Cross-pillar service, no DB — federates over the running pillars                                                    |
| **mcp**          | 3002 | MCP HTTP gateway (binds `MCP_PORT`, overlapping inventory's port in code); exposes pillar data as tools, owns no DB |
| **shell**        | —    | Frontend host — mounts each pillar's `app/` into one UI                                                             |
| **docs**         | —    | Documentation pillar                                                                                                |
| **moltbot**      | —    | Telegram channel for POPS                                                                                           |

Cross-pillar communication goes through `@pops/pillar-sdk` (`libs/sdk`). The only two structural units are **PILLAR** (`pillars/`) and **LIB** (`libs/`) — there is no `apps/` directory and no `packages/*`. Build is per-unit via mise + pnpm + cargo (no turbo).

See the [roadmap implementation tracker](roadmap.md#implementation-tracker) for detailed status across all pillars.
