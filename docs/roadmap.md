# POPS Roadmap

Sequenced by dependency, not by date. Target: feature-complete by end of 2026.

## How to read this

Each phase unlocks the next. Within a phase, items can be parallelised. The roadmap is a living document — reorder as priorities shift, but respect the dependency chains.

## App Priority Order

Agreed sequencing based on daily value, effort, and dependencies:

| # | App | Rationale |
|---|-----|-----------|
| 1 | Media Tracker | Quick win, self-contained, validates multi-app architecture |
| 2 | Inventory Upgrade | High daily use, partially exists, grows into a core app |
| 3 | Finance Polish + Subscriptions | Already works — reduce friction, add subscriptions as a feature (not separate app) |
| 4 | Fitness Tracker | Gym and training log. Health integrations (Apple Health, meal logging) layer on later |
| 5 | Documents Vault | Low effort, high connectivity — unlocks receipt/warranty linking for inventory, finance, travel |
| 6 | Travel Planner | Benefits from finance (budgets), documents (bookings), and AI (planning) already being in place |
| 7 | Books / Reading | Same pattern as media tracker, low effort once that template exists |
| 8 | Recipe Book | Long-term feature, lower daily urgency |
| 9 | Maintenance & Chores | Natural extension of inventory, reminder-driven |
| 10 | Contacts / CRM-lite | Lowest urgency — gift tracking, events |
| 11 | Home Automation | Biggest unknown, explore only if HomeAssistant leaves a clear gap |

## Phase 1 — Foundation

> Extract the shared platform that everything else builds on.

- **Shell & App Switcher** — Extract shell into pops-shell. Shared layout, routing, navigation, theming, auth.
- **UI Component Library** — Extract shared components into a package. DataTable, forms, inputs, cards.
- **API Rename & Modularisation** — pops-api → pops-api. Domain routers as modules, not a monolith name.
- **DB Schema Patterns** — Establish conventions for new domains: migrations, shared entities, cross-domain foreign keys.
- **Responsive Foundation** — Ensure the shell and shared components work well on mobile viewports from day one.

**Depends on:** Nothing (current state is the starting point).
**Unlocks:** Every app below.

## Phase 2 — Core Apps

> Ship the highest-value apps on the new foundation.

- **Media Tracker** — Movies and TV shows. Categorisation, recommendations, watchlist. Plex/Radarr/Sonarr/TMDB integration.
- **Inventory Upgrade** — Grow from stub to full app. Warranties, purchase linking, Paperless-ngx receipt linking. Most frequently used app.
- **Finance Polish + Subscriptions** — Reduce friction, automate more, add subscriptions tracking as a built-in feature. Bank apps cover the gap in the meantime.
- **Fitness Tracker** — Training log: exercises, sets, reps, progress tracking, workout history. Keep it simple — no Apple Health integration yet.
- **Documents Vault** — Surfaces Paperless-ngx within POPS. Links receipts/warranties to inventory and transactions. Low effort, high connectivity.

**Depends on:** Phase 1 (shell, shared UI, modular API).
**Unlocks:** Cross-domain linking, AI layer, remaining apps.

## Phase 3 — AI Layer

> The three layers of intelligence that make POPS proactive.

- **AI Overlay** — Contextual assistant integrated into the shell. Knows which app you're in, can query across domains, suggests actions. Think Notion AI but for the whole platform.
- **AI Categorisation & Input** — Automated data entry, entity matching, transaction categorisation. Extends existing import pipeline patterns to new domains.
- **AI Inference & Monitoring** — Proactive insights, anomaly detection, smart automations. The Moltbot side — alerts via Telegram, scheduled analysis, "your electricity bill jumped 40% this month."

**Depends on:** Phase 2 (needs multiple domains with real data to be useful).
**Unlocks:** The "system does more for me" promise.

Note: AI categorisation already exists in the import pipeline and continues to grow in parallel. Phase 3 is about the overlay and inference layers.

## Phase 4 — Expansion Apps

> Fill out the platform with additional domains. Each benefits from the AI layer being in place.

- **Travel Planner** — Trip planning, organising, tracking. Links to finance (budgets), documents (bookings), recipes (local cuisine).
- **Books / Reading** — Same architecture as media tracker. Reading list, reviews, recommendations.
- **Recipe Book** — Ingredients, recipes, meal planning. Links to finance (grocery spend), inventory (kitchen gear).

**Depends on:** Phase 2 (architecture proven), Phase 3 (AI reduces input friction).

## Phase 5 — Mobile & Hardware

> Dedicated mobile experience and wall-mounted dashboard.

- **Native Mobile App** — iOS app. Daily driver on iPhone.
- **HomePad / Wall Mount** — Dashboard mode optimised for always-on tablet. Widgets from every domain.

**Depends on:** Multiple apps live with stable APIs.

## Phase 6 — Long Tail

> Build when the core is solid and there's bandwidth.

- **Maintenance & Chores** — Extends inventory with service schedules and reminders.
- **Contacts / CRM-lite** — Gift tracking, event planning.
- **Home Automation** — HomeAssistant integration if there's a clear gap.

**Depends on:** Core platform mature.

---

## Dependency Chain

```
Foundation → Core Apps ──→ AI Layer → Expansion Apps → Mobile → Long Tail
                │                         ↑
                └── AI Categorisation ─────┘
                    (continues in parallel,
                     already partially exists)
```

## Cross-cutting (not phased)

These grow incrementally rather than shipping as a single phase:

- **AI Categorisation** — Extends as new domains are added
- **Responsive Design** — Every app must work on mobile from day one (PWA)
- **Cross-domain Linking** — Shared entities, foreign keys between domains, unified search
