# App Ideas

Brainstorm dump from 2026-03-18, updated 2026-03-20. Nothing here is committed to — items get promoted to themes when deliberately prioritised.

## Confirmed (will build)

- **Finance** — Budgeting, transaction tracking, wishlist, bank imports. Heavily automated. *Already exists. Retroactive product spec complete — see [finance spec](../themes/02-finance/README.md).*
- **Home Inventory** — Physical connectivity graph, hierarchical locations, photos, asset IDs, Paperless-ngx receipt linking, warranty tracking, insurance reports. Highest daily-use app. *Partially exists. Fully specced — see [inventory theme](../themes/04-inventory/README.md).*
- **Recipe Book** — Ingredient tracking, recipe management, meal planning. Links to finance (grocery spend) and inventory (kitchen gear).
- **Media** — Preference learning and recommendation engine for movies and TV shows. 1v1 pairwise comparisons (ELO-scored) build a taste profile across configurable dimensions. TMDB (movies), TheTVDB (TV), Plex sync, Radarr/Sonarr status. *Fully specced — see [media theme](../themes/03-media/README.md).*
- **Travel Planner** — Trip planning, organising, tracking. Links to finance (trip budgets), recipes (local cuisine).
- **AI Hub** — Integrated AI agents that can query and act across all apps. Cross-domain intelligence layer. Universal object URIs ([ADR-010](../architecture/adr-010-universal-object-uri.md)) enable the AI to reference any object in the system.

## Strong candidates

- **Maintenance & Chores** — Extends inventory with service schedules, filter replacements, seasonal tasks. Reminder-driven.
- **Documents Vault** — Surfaces Paperless-ngx content within POPS. Links receipts/warranties/manuals to inventory items and transactions.

## Worth exploring

- **Books / Reading** — Same pattern as media. Goodreads replacement. Track reading list, reviews, recommendations. Could reuse the pairwise comparison system from media.
- **Health & Fitness** — Weight, exercise, meal logging (ties into recipes). Apple Health integration.
- **Contacts / CRM-lite** — Gift tracking, event planning. "What did I get Sarah for her birthday last year?"
- **Home Automation** — Dashboard for smart home devices. HomeAssistant integration. Links to inventory (devices).
- **Mobile App** — Native iOS app wrapping the PWA or React Native. Target: iPhone daily driver + iPad/HomePad wall mount.
- **Settings** — Centralised settings app for managing API keys (TMDB, TheTVDB, Up Bank), integration connections (Plex URL/token, Radarr/Sonarr URLs/keys), comparison dimensions, and system-wide preferences. Currently API keys live in `.env` / Docker secrets — a Settings app would provide a UI for runtime configuration without redeploying.

## Resolved / absorbed

Items from the original brainstorm that have been scoped into existing themes or removed:

- ~~**Subscriptions Tracker**~~ — Removed. No active streaming subscriptions. If needed in the future, lives as a finance feature, not a separate app.
- ~~**Media Tracker** (original framing)~~ — Evolved from "tracker" to "preference learning and recommendation engine." The tracking is the input, recommendations are the output. See [media theme](../themes/03-media/README.md).

## Search context enrichment (Option B)

Deferred from PRD-057/058 v1 design (2026-04-04).

v1 passes raw `SearchContext` (current app, page, entity, filters) to each adapter. Adapters use what they natively understand and ignore the rest. No cross-domain inference.

The idea for v2: before fan-out, an enrichment layer extracts semantic tags from context. E.g. `location: "bedroom"` → tags: `["bedroom", "furniture", "home"]`. Tags are passed alongside raw context. Adapters can optionally boost results matching tags without understanding other domains' data models. The enrichment step could use Claude for semantic extraction, or a simpler keyword/category mapping.

Use case: viewing bedroom inventory, search "lamp" → finance adapter boosts purchases tagged "furniture" or from home goods retailers. Without enrichment, finance ignores the inventory context entirely.

Build this when the AI overlay (PRD-054) exists — the enrichment layer is a natural consumer of the same AI infrastructure.

## Cross-communication patterns

These are the links that make POPS more than separate apps:

| From | To | Example |
|------|----|---------|
| Inventory | Finance | Link item to purchase transaction |
| Recipes | Finance | "How much did I spend on groceries this month?" |
| Travel | Finance | Trip budget vs actual spend |
| Travel | Recipes | Local cuisine research for destinations |
| Maintenance | Inventory | "When did I last service the vacuum?" |
| Documents | Inventory | Warranty PDF linked to the item |
| Documents | Finance | Receipt linked to the transaction |
| AI Hub | Everything | Natural language queries across all domains via [universal URIs](../architecture/adr-010-universal-object-uri.md) |
| Dashboard | Everything | iPad wall mount pulling widgets from each app |
