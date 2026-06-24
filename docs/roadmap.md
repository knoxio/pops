# POPS Roadmap

A current-state snapshot of the platform and a forward view. For why POPS exists
and the design principles, see [vision.md](vision.md). For per-pillar detail,
follow the links into each pillar's `docs/README.md`.

POPS is a fleet of independent REST pillars. Each owns its own SQLite database,
serves a ts-rest + zod contract (Rust pillars: axum + OpenAPI), exports a
`./manifest`, and self-registers with the `registry` pillar on boot. Search,
settings, navigation, AI tools, and routing are all projected from the **live
registry** at request time — nothing compiles against a static pillar list.

## Today — the live platform

### Foundations (Done)

| Foundation                                | What it gives the fleet                                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Platform](themes/platform/README.md)     | CI gates + per-pillar GHCR images, the public `infra/docker-compose.yml` deploy contract + Watchtower hook, per-pillar Drizzle-at-boot DB lifecycle, Redis + BullMQ job queue, sqlite-vec, OpenAPI projection, the MCP gateway                                   |
| [Foundation](themes/foundation/README.md) | The `@pops/ui` design system + Storybook, the registry-driven shell (app rail, nav, theming, accent propagation), the per-pillar REST contract pattern, DB/migration conventions, settings + feature-toggle manifest dimensions, lint-enforced module boundaries |
| [Federation](themes/federation/README.md) | The `@pops/pillar-sdk`, the registry protocol (register / heartbeat / snapshot / SSE), the manifest dimensions (search / AI tools / settings / sinks), the search + AI-tool orchestrator, and a language-neutral wire spec proven by the Rust `contacts` pillar  |

### Data pillars (Done unless noted)

| Pillar                                                 | Port | One-liner                                                                                                                             |
| ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [registry](themes/federation/README.md)                | 3001 | Runtime directory — pillars register and heartbeat here; the sole source of truth for fleet membership                                |
| [inventory](../pillars/inventory/docs/README.md)       | 3002 | Home inventory: connectivity graph over a hierarchical location tree, photos, asset IDs, Paperless-ngx receipts, insurance reports    |
| [media](../pillars/media/docs/README.md)               | 3003 | Movie/TV tracking + taste learning: 1v1 ELO comparisons, recommendations, Plex / Radarr / Sonarr / TMDB / TheTVDB, library rotation   |
| [finance](../pillars/finance/docs/README.md)           | 3004 | Personal finance: bank-CSV imports with entity matching, learned-rule + AI categorisation, budgets, wishlist                          |
| [food](../pillars/food/docs/README.md)                 | 3005 | Recipes, meal planning, batch/pantry FIFO, multimodal ingest (web / Instagram / screenshot / text) — _in progress_                    |
| [lists](../pillars/lists/docs/README.md)               | 3006 | Generic domain-agnostic lists (shopping / packing / todo / generic); the substrate food and others push items into                    |
| [cerebrum](../pillars/cerebrum/docs/README.md)         | 3007 | Personal cognitive infrastructure: Markdown engrams, semantic + structured retrieval, autonomous curation, Ego chat agent — _partial_ |
| [ai](../pillars/ai/docs/README.md)                     | 3008 | AI observability: one inference log across every pillar, cost/latency/quality dashboards, budgets, alerts — _partial_                 |
| [orchestrator](../pillars/orchestrator/docs/README.md) | 3009 | Stateless cross-pillar aggregator (no DB): federated search fan-out + the live AI-tool registry                                       |
| [contacts](../pillars/contacts/docs/README.md)         | 3010 | The entities directory (people / companies / places). The one **Rust** pillar — the cross-language federation proof                   |

Supporting pillars: [shell](../pillars/shell/docs/README.md) (the SPA host + nginx
dispatcher, owns no data), [mcp](../pillars/mcp/docs/README.md) (HTTP MCP gateway —
binds `3002` via `MCP_PORT`, overlapping inventory's external port; it dispatches
to pillars over REST and owns no DB), and `moltbot` (Telegram surface).

## In progress / partial

| Area                                                         | What's done                                                                         | What's missing                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Food](../pillars/food/docs/README.md)                       | Schema, recipe management, review queue, meal planning, multimodal ingest in flight | End-to-end polish and the long ideas backlog (Instagram acquisition, substitution graph, shopping-list fidelity) |
| Cerebrum — [Emit](../pillars/cerebrum/docs/epics/03-emit.md) | Query engine grounds NL questions in engrams                                        | Document generation and proactive nudges                                                                         |
| Cerebrum — [Glia](../pillars/cerebrum/docs/epics/04-glia.md) | Curation workers (pruner, consolidator, linker, auditor)                            | Trust-graduation review UX and reverts                                                                           |
| Cerebrum — [Ego](../pillars/cerebrum/docs/epics/05-ego.md)   | Ego channels + core chat agent                                                      | SSE streaming, recent-action history summarisation, CLI                                                          |
| [AI Ops](../pillars/ai/docs/README.md)                       | Inference log, dashboards, budget tracking, alerts                                  | The pre-call budget gate (block / warn / fall back to a local model before an over-budget call)                  |
| Foundation — UI / responsive / search                        | Shell, settings, feature toggles, module boundaries all shipped                     | `@pops/ui` token/component coverage, responsive adaptations, and search ranking are each Partial                 |
| Federation — SDK / shell drift                               | Server proxy, discovery, registry, Rust peer all live                               | Several SDK + shell PRDs sit at `To Review` / `Partial` pending drift-gate and external-bundle wiring            |

The roadmap no longer tracks status PRD-by-PRD. Each theme/pillar README's epic
and PRD tables are the source of truth; the statuses above are the genuinely
unfinished surfaces.

## Forward

### Bridge pillars — POPS as additive to a device ecosystem

A [bridge pillar](ideas/bridge-pillars.md) has the exact shape of any pillar, but
its source of truth is an upstream system rather than user-entered data. It mirrors
the upstream into its own SQLite and exposes it through the standard `searchAdapter`
and `aiTools` dimensions, so upstream entities become searchable and AI-callable
inside POPS with no bespoke integration code.

- [HA bridge](ideas/ha-bridge-pillar.md) — the reference bridge: mirror every Home
  Assistant entity + state, expose reads/control as AI tools, accept outbound `sinks`.
- [POPS → HA event publisher](ideas/pops-to-ha-event-publisher.md) — the first real
  consumer of the `sinks` dimension: POPS events become HA `fire_event` calls.
- `mqtt-bridge` / `esphome-bridge` — fork the HA shape onto other upstreams.

POPS does not compete with Home Assistant on device count or automation logic —
it observes and controls, additively.

### Runtime LAN discovery — registry as the sole source of truth

The north star for the federation contract: a pillar (in-repo, external, or on
another box) joins purely at runtime by registering with the `registry` pillar —
no compiled list, no rebuild of the shell, no edit in this repo. The remaining
`To Review` / `Partial` federation PRDs (registry-driven shell UI, external-bundle
lazy-loading, contract drift CI) close the gap toward that being fully hands-off.

### New domains

Promoted from the [app-ideas brainstorm](ideas/app-ideas.md) when deliberately
prioritised — each is a new pillar following the proven shape:

| Domain      | Sketch                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------- |
| Documents   | Surface Paperless-ngx across POPS; link receipts/warranties/manuals to items + transactions |
| Fitness     | Gym/training log — exercises, sets, reps, progress; Apple Health later                      |
| Travel      | Trip planning; links to finance (budgets), documents (bookings), food (local cuisine)       |
| Books       | Reading tracker; reuses media's pairwise-comparison taste engine                            |
| Maintenance | Service schedules, renewals, recurring chores; extends inventory                            |
| Social      | Contacts/CRM-lite — gift tracking, event planning over the `contacts` directory             |
| Mobile      | Native iOS daily driver + wall-mounted HomePad dashboard over the existing PWA              |

### Deeper roadmaps per pillar

Each shipped pillar carries its own `docs/ideas/` backlog of refinements — the
richest are [food](../pillars/food/docs/ideas/), [media](../pillars/media/docs/ideas/),
[cerebrum](../pillars/cerebrum/docs/ideas/), [finance](../pillars/finance/docs/ideas/),
and [inventory](../pillars/inventory/docs/ideas/). The platform-level
[`docs/ideas/`](ideas/) directory holds the cross-cutting forward work (bridge
pillars, federation SDK/shell hardening, subscription model, settings federation).
