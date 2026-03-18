# App Ideas

Brainstorm dump from 2026-03-18. Nothing here is committed to — items get promoted to themes when deliberately prioritised.

## Confirmed (will build)

- **Finance** — Budgeting, transaction tracking, wishlist, bank imports. Heavily automated. *Already exists.*
- **Home Inventory** — Item tracking, warranties, maintenance schedules, receipts (Paperless-ngx). Most frequently used app. *Partially exists.*
- **Recipe Book** — Ingredient tracking, recipe management, meal planning. Links to finance (grocery spend) and inventory (kitchen gear).
- **Media Tracker** — Movies and TV shows. Categorisation, recommendations, monitoring. Plex/Radarr/Sonarr sync, TMDB integration. Could be one app or split movies/TV.
- **Travel Planner** — Trip planning, organising, tracking. Links to finance (trip budgets), recipes (local cuisine).
- **AI Hub** — Integrated AI agents that can query and act across all apps. Cross-domain intelligence layer.

## Strong candidates

- **Subscriptions Tracker** — Lives in finance but surfaces recurring costs across media (streaming), recipes (meal kits), home auto (cloud services). Aggregated view of all recurring spend.
- **Maintenance & Chores** — Extends inventory with service schedules, filter replacements, seasonal tasks. Reminder-driven.
- **Documents Vault** — Surfaces Paperless-ngx content within POPS. Links receipts/warranties/manuals to inventory items and transactions.

## Worth exploring

- **Books / Reading** — Same pattern as media tracker. Goodreads replacement. Track reading list, reviews, recommendations.
- **Health & Fitness** — Weight, exercise, meal logging (ties into recipes). Apple Health integration.
- **Contacts / CRM-lite** — Gift tracking, event planning. "What did I get Sarah for her birthday last year?"
- **Home Automation** — Dashboard for smart home devices. HomeAssistant integration. Links to inventory (devices).
- **Mobile App** — Native iOS app wrapping the PWA or React Native. Target: iPhone daily driver + iPad/HomePad wall mount.

## Cross-communication patterns

These are the links that make POPS more than separate apps:

| From | To | Example |
|------|----|---------|
| Inventory | Finance | Link item to purchase transaction |
| Recipes | Finance | "How much did I spend on groceries this month?" |
| Media | Finance | Track streaming subscription costs |
| Travel | Finance | Trip budget vs actual spend |
| Travel | Recipes | Local cuisine research for destinations |
| Maintenance | Inventory | "When did I last service the vacuum?" |
| Documents | Inventory | Warranty PDF linked to the item |
| Documents | Finance | Receipt linked to the transaction |
| AI Hub | Everything | Natural language queries across all domains |
| Dashboard | Everything | iPad wall mount pulling widgets from each app |
