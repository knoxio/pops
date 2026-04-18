# POPS Roadmap

Sequenced by dependency, not by date. Target: feature-complete by end of 2026.

## How to read this

Each phase unlocks the next. Within a phase, items can be parallelised. The roadmap is a living document — reorder as priorities shift, but respect the dependency chains.

## App Priority Order

Sequenced by daily value, effort, and dependencies:

| #   | App                            | Rationale                                                                                       |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Media Tracker                  | Quick win, self-contained, validates multi-app architecture                                     |
| 2   | Inventory                      | High daily use, grows into a core app                                                           |
| 3   | Finance Polish + Subscriptions | Reduce friction, add subscriptions as a feature (not separate app)                              |
| 4   | Fitness Tracker                | Gym and training log. Health integrations (Apple Health, meal logging) layer on later           |
| 5   | Documents Vault                | Low effort, high connectivity — unlocks receipt/warranty linking for inventory, finance, travel |
| 6   | Travel Planner                 | Benefits from finance (budgets), documents (bookings), and AI (planning) already being in place |
| 7   | Books / Reading                | Same pattern as media tracker, low effort once that template exists                             |
| 8   | Recipe Book                    | Long-term feature, lower daily urgency                                                          |
| 9   | Maintenance & Chores           | Natural extension of inventory, reminder-driven                                                 |
| 10  | Contacts / CRM-lite            | Lowest urgency — gift tracking, events                                                          |
| 11  | Home Automation                | Biggest unknown, explore only if HomeAssistant leaves a clear gap                               |

---

## Implementation Tracker

Live status of every theme and epic. Updated as work completes.

### Phase 0 — Infrastructure

| Epic                               | Status | Notes                               |
| ---------------------------------- | ------ | ----------------------------------- |
| Server provisioning & OS hardening | Done   | Ansible playbook, SSH, firewall     |
| Docker Compose & networking        | Done   | 3 networks, 7+ services             |
| Cloudflare Tunnel + Access         | Done   | Zero-trust, no port forwarding      |
| CI/CD workflows                    | Done   | 8 GitHub Actions workflows          |
| Secrets management                 | Done   | Ansible Vault → Docker secrets      |
| Backups (Backblaze B2)             | Done   | rclone encrypted                    |
| Monitoring & health checks         | Done   | Docker health checks on api + shell |

#### Cortex Infrastructure

| Epic                         | Status | Notes                                                                                           |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Redis container & connection | Done   | Redis 7 Alpine, ioredis v5, Ansible role, persistence disabled, healthcheck (#1945)             |
| Job queue (BullMQ)           | Done   | Typed queues, worker process, DLQ, Plex sync migrated, jobs management API (#1946)              |
| OpenAPI secondary contract   | Done   | trpc-openapi, spec at /api/docs, CI validation, jobs router annotated (#1950)                   |
| Vector storage (sqlite-vec)  | Done   | sqlite-vec extension, embedding schema, similarity search, chunker, background pipeline (#1948) |

### Phase 1 — Foundation

| Epic                                  | Status | Notes                                                                                                                  |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Project bootstrap (pnpm, Turbo, mise) | Done   | pnpm v10, Turbo orchestration, mise task runner                                                                        |
| UI component library (`@pops/ui`)     | Done   | 86+ components, Storybook, Tailwind v4                                                                                 |
| Shell & app switcher (`pops-shell`)   | Done   | Lazy-loaded apps, AppRail, responsive sidebar, app theme colour propagation                                            |
| API modularisation (`pops-api`)       | Done   | 4 domain modules (core, finance, inventory, media)                                                                     |
| DB schema patterns & migrations       | Done   | 28 tables, timestamp migrations, entity types                                                                          |
| Responsive foundation                 | Done   | Tailwind v4 breakpoints, mobile-first, touch targets                                                                   |
| Drizzle ORM migration                 | Done   | All modules use Drizzle ORM; raw SQL eliminated                                                                        |
| Platform search (Epic 07)             | Done   | All 3 PRDs complete: search engine (PRD-057), search UI with keyboard nav (PRD-056), contextual intelligence (PRD-058) |

### Phase 2 — Core Apps

#### Finance

| Area                                          | Status | Notes                                                                                            |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Transaction ledger (CRUD, filtering, tagging) | Done   | 6 pages, inline editing                                                                          |
| Import pipeline (CSV wizard, entity matching) | Done   | 7-step wizard, all 7 PRDs complete including ANZ PDF parser (PRD-022)                            |
| Entity registry                               | Done   | Aliases, default tags, AI fallback                                                               |
| Corrections (learned rules)                   | Done   | Classification + proposals, tag-rule wizard, rule manager priority/preview/override all complete |
| Budgets                                       | Done   | Monthly/yearly, active/inactive                                                                  |
| Wishlist                                      | Done   | Savings goals with progress                                                                      |
| AI categorisation                             | Done   | Claude Haiku, disk-cached, cost-tracked                                                          |

#### Media

| Epic                        | Status      | Notes                                                                                                                                     |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Data model & API module     | Done        | Split tables, tRPC routers, 28 tables                                                                                                     |
| TMDB client (movies)        | Done        | Search, metadata, poster cache, rate limiting                                                                                             |
| TheTVDB client (TV)         | Done        | Auth, search, seasons/episodes, poster cache                                                                                              |
| App package & core UI       | Done        | 12 pages, MediaCard, grids, detail views                                                                                                  |
| Watchlist management        | Done        | Priority, filters, auto-remove on watch                                                                                                   |
| Watch history & tracking    | Done        | Episode-level, chronological history                                                                                                      |
| Ratings & comparisons       | Done        | Compare arena, ELO scoring, radar charts, rankings                                                                                        |
| Discovery & recommendations | Done        | Discover page (PRDs 038, 060) and shelf-based discovery (PRD-065) all done                                                                |
| Plex sync                   | Done        | Library import (paginated), watch history sync (local + Discover cloud), watchlist sync (bidirectional), auto-check on add, settings page |
| Radarr & Sonarr             | Done        | Status badges, Radarr request management, Sonarr request management — all done                                                            |
| Library rotation            | Not started | Automated movie lifecycle: source lists, daily add/remove cycle, disk space gating (PRDs 070-072)                                         |

#### Inventory

| Epic                                               | Status   | Notes                                              |
| -------------------------------------------------- | -------- | -------------------------------------------------- |
| Schema (locations, connections, photos, asset IDs) | Done     | Hierarchical locations, junction table             |
| App package & CRUD UI                              | Done     | 6 pages, list/grid, detail, create/edit            |
| Location tree management                           | Done     | Hierarchical browser, contents panel               |
| Connections & graph                                | Done     | Bidirectional links, connection trace              |
| Paperless-ngx integration                          | Done     | Document linking, thumbnails                       |
| Warranty, value & reporting                        | Done     | Insurance report, warranty page, value breakdown   |
| Notion import                                      | Not done | One-time migration script; may no longer be needed |

#### AI Operations

| Epic                               | Status | Notes                                                                                 |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| AI operations app (`@pops/app-ai`) | Done   | Usage, model config, rules browser, prompt viewer, cache management — all pages built |

#### Fitness

| Epic            | Status      | Notes          |
| --------------- | ----------- | -------------- |
| Fitness tracker | Not started | No code exists |

#### Documents Vault

| Epic          | Status      | Notes                                          |
| ------------- | ----------- | ---------------------------------------------- |
| Documents app | Not started | Paperless integration exists in inventory only |

### Cerebrum — Phase 1 (MVP)

| Epic                          | Status      | Notes                                                                                                |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Engram Storage (format, CRUD) | Done        | PRD-077 (format, templates, index schema, CRUD, tRPC, provisioning) + PRD-078 (scope model) complete |
| Thalamus (indexing/retrieval) | Not started | File watcher, frontmatter sync, embedding trigger, retrieval engine                                  |
| Ingest (input pipeline)       | Not started | Manual, agent, capture channels + classification + scope inference                                   |
| Emit (output production)      | Not started | Query engine, document generation, proactive nudges                                                  |

### Cerebrum — Phase 2 (Curation & Interface)

| Epic                    | Status      | Notes                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------ |
| Glia (curation workers) | Not started | Pruner, consolidator, linker, auditor + trust graduation           |
| Ego (chat agent)        | Not started | Conversation engine, shell panel, MCP, Moltbot. Supersedes PRD-054 |

### Cerebrum — Phase 3 (Automation & Ecosystem)

| Epic                   | Status      | Notes                                                          |
| ---------------------- | ----------- | -------------------------------------------------------------- |
| Reflex (automation)    | Not started | reflexes.toml, event/threshold/scheduled triggers              |
| Plexus (plugin system) | Not started | Adapter interface, core integrations (email, calendar, GitHub) |

### Phase 1 — Foundation (continued)

| Epic                    | Status      | Notes                                                                       |
| ----------------------- | ----------- | --------------------------------------------------------------------------- |
| Unified Settings System | Not started | Self-registering settings page, replaces scattered Plex/Arr/Rotation/AI UIs |

### Phase 3 — AI Layer

| Epic                              | Status      | Notes                                                                              |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| AI overlay (contextual assistant) | Superseded  | Absorbed by Cerebrum Epic 05 (Ego)                                                 |
| AI inference & monitoring         | Not started | Proactive insights, anomaly detection                                              |
| AI observability                  | Not started | Multi-provider tracking, budget enforcement, latency/quality metrics, local models |

### Phase 4 — Expansion Apps

| Epic            | Status      | Notes |
| --------------- | ----------- | ----- |
| Travel planner  | Not started |       |
| Books / Reading | Not started |       |
| Recipe book     | Not started |       |

### Phase 5 — Mobile & Hardware

| Epic                 | Status      | Notes               |
| -------------------- | ----------- | ------------------- |
| Native iOS app       | Not started | PWA works on mobile |
| HomePad / wall mount | Not started |                     |

### Phase 6 — Long Tail

| Epic                 | Status      | Notes |
| -------------------- | ----------- | ----- |
| Maintenance & chores | Not started |       |
| Contacts / CRM-lite  | Not started |       |
| Home automation      | Not started |       |

---

## Phase Descriptions

### Phase 0 — Infrastructure

> Provision the hardware and deployment pipeline that runs everything.

- **Server** — Provision, harden, Docker runtime
- **Networking** — Cloudflare Tunnel, zero-trust access, Docker networks
- **CI/CD** — GitHub Actions, automated quality gates, deployment workflows
- **Secrets** — Ansible Vault, Docker secrets, environment management
- **Backups** — Encrypted offsite to Backblaze B2
- **Cortex Infrastructure** — Redis (job queue + cache), BullMQ (durable workers), OpenAPI (secondary API contract), sqlite-vec (vector storage)

**Depends on:** Nothing.
**Unlocks:** Production deployment for all phases. Cortex Infrastructure unlocks the Cortex service and Phase 3 AI Layer.

### Phase 1 — Foundation

> Build the shared platform that all apps run on.

- **Shell & App Switcher** — Multi-app shell with shared layout, routing, navigation, theming
- **UI Component Library** — Shared components in `@pops/ui`. DataTable, forms, inputs, cards
- **API Modularisation** — Domain routers as tRPC modules under one Express server
- **DB Schema Patterns** — Conventions for migrations, shared entities, cross-domain foreign keys
- **Responsive Foundation** — Shell and shared components work on mobile viewports from day one

**Depends on:** Infrastructure (for deployment).
**Unlocks:** Every app below.

### Phase 2 — Core Apps

> Build the highest-value apps on the foundation.

- **Media Tracker** — Movies and TV shows. Categorisation, recommendations, watchlist. Plex/Radarr/Sonarr/TMDB integration
- **Inventory** — Full CRUD. Warranties, purchase linking, Paperless-ngx receipt linking. Highest daily-use app
- **Finance Polish + Subscriptions** — Reduce friction, automate more, add subscriptions tracking
- **Fitness Tracker** — Training log: exercises, sets, reps, progress tracking, workout history
- **Documents Vault** — Surfaces Paperless-ngx within POPS. Links receipts/warranties to inventory and transactions

**Depends on:** Phase 1 (shell, shared UI, modular API).
**Unlocks:** Cross-domain linking, AI layer, remaining apps.

### Cerebrum

> Personal cognitive infrastructure — a self-curating knowledge base that compounds over a lifetime.

- **Engram Storage** — Markdown files with YAML frontmatter, template system, hierarchical scope model
- **Thalamus** — Indexing middleware: file watcher, frontmatter sync, embedding generation, cross-source retrieval
- **Ingest** — Input pipeline: manual, agent, capture channels with classification, entity extraction, scope inference
- **Emit** — Output production: natural language Q&A, document generation, proactive nudges
- **Glia** — Autonomous curation: pruner, consolidator, linker, auditor with trust graduation
- **Ego** — Chat agent: shell panel, MCP tools, Moltbot, CLI. Supersedes AI Overlay
- **Reflex** — Automation: event/threshold/scheduled triggers via reflexes.toml
- **Plexus** — Plugin system: adapter interface, email/calendar/GitHub integrations

**Depends on:** Infrastructure Epic 08 (Redis, BullMQ, sqlite-vec, OpenAPI). Phase 2 core apps for cross-domain queries.
**Unlocks:** The "system does more for me" promise. Lifetime personal knowledge base.

### Phase 3 — AI Layer

> The intelligence layers that make POPS proactive.

- **AI Overlay** — Superseded by Cerebrum Epic 05 (Ego)
- **AI Categorisation & Input** — Automated data entry, entity matching, transaction categorisation. Extends import pipeline patterns to new domains
- **AI Inference & Monitoring** — Proactive insights, anomaly detection, smart automations. Moltbot alerts, scheduled analysis

**Depends on:** Phase 2 (needs multiple domains with real data). Cerebrum (Ego replaces AI Overlay).
**Unlocks:** The "system does more for me" promise.

### Phase 4 — Expansion Apps

> Additional domains. Each benefits from the AI layer.

- **Travel Planner** — Trip planning, organising, tracking. Links to finance, documents, recipes
- **Books / Reading** — Same architecture as media tracker. Reading list, reviews, recommendations
- **Recipe Book** — Ingredients, recipes, meal planning. Links to finance (grocery spend), inventory (kitchen gear)

**Depends on:** Phase 2 (architecture proven), Phase 3 (AI reduces input friction).

### Phase 5 — Mobile & Hardware

> Dedicated mobile experience and wall-mounted dashboard.

- **Native Mobile App** — iOS app, daily driver on iPhone
- **HomePad / Wall Mount** — Dashboard mode optimised for always-on tablet. Widgets from every domain

**Depends on:** Multiple apps live with stable APIs.

### Phase 6 — Long Tail

> Build when the core is solid and there's bandwidth.

- **Maintenance & Chores** — Extends inventory with service schedules and reminders
- **Contacts / CRM-lite** — Gift tracking, event planning
- **Home Automation** — HomeAssistant integration if there's a clear gap

**Depends on:** Core platform mature.

---

## Dependency Chain

```
Infrastructure → Foundation → Core Apps ──→ AI Layer → Expansion Apps → Mobile → Long Tail
       │                          │                         ^
       │                          └── AI Categorisation ────┘
       │                               (grows with each domain)
       │
       └── Cortex Infra → Cerebrum (Phase 1: Store/Index/Ingest/Emit)
                              │
                              ├── Phase 2: Glia + Ego
                              │
                              └── Phase 3: Reflex + Plexus
```

## Cross-cutting (not phased)

These grow incrementally rather than shipping as a single phase:

- **AI Categorisation** — Extends as new domains are added
- **Responsive Design** — Every app must work on mobile from day one (PWA)
- **Cross-domain Linking** — Shared entities, foreign keys between domains, unified search
