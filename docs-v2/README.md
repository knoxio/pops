# POPS Documentation

## What is POPS?

POPS (Personal Operations System) is a self-hosted platform that manages finances, home inventory, media tracking, and more — from a single shell, one database, one API. It runs on an N95 mini PC behind Cloudflare Tunnel with zero port forwarding.

See [vision.md](vision.md) for the full design philosophy.

## Reading Order

1. **[Vision](vision.md)** — Why POPS exists, design principles, strategy
2. **[Roadmap](roadmap.md)** — Phases, app priority, implementation tracker
3. **[Themes](themes/README.md)** — Strategic initiatives (Foundation, Media, Inventory, etc.)
4. **[Architecture](architecture/)** — ADRs for key technical decisions
5. **Theme epics and PRDs** — Detailed build specs per domain

## Doc Structure

```
docs-v2/
├── README.md                ← you are here
├── CLAUDE.md                ← standards, rules, templates
├── vision.md                ← why, principles, strategy
├── roadmap.md               ← phases, sequencing, implementation tracker
├── ideas/                   ← brainstorm — not committed to
├── architecture/            ← ADRs (architecture decision records)
│   └── adr-NNN-slug.md
├── _templates/              ← templates for each doc type
└── themes/                  ← one folder per strategic domain
    └── NN-<name>/
        ├── README.md        ← theme overview, epic index
        ├── epics/
        │   └── NN-slug.md   ← scope, coordination, PRD index
        └── prds/
            └── NNN-slug/
                ├── README.md    ← detailed spec
                ├── us-01-slug.md
                └── us-02-slug.md
```

## Doc Types

| Type | What it is | Where it lives |
|------|-----------|----------------|
| **Theme** | Strategic domain overview, lists epics | `themes/<name>/README.md` |
| **Epic** | Scope and coordination for a chunk of work | `themes/<name>/epics/NN-slug.md` |
| **PRD** | Detailed spec — data model, API, edge cases | `themes/<name>/prds/NNN-slug/README.md` |
| **User Story** | Single implementable unit, bite-sized | `themes/<name>/prds/NNN-slug/us-NN-slug.md` |
| **ADR** | Architecture decision and its rationale | `architecture/adr-NNN-slug.md` |

See [CLAUDE.md](CLAUDE.md) for templates and standards.

## Current State

POPS has a working platform with 4 apps (Finance, Media, Inventory, AI), deployed on an N95 mini PC with Docker, Cloudflare Tunnel, and CI/CD. See the [roadmap implementation tracker](roadmap.md#implementation-tracker) for detailed status.
