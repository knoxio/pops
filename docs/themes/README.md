# Themes

Each theme is a strategic initiative grouping related epics. Themes persist across quarters. Detailed theme READMEs are written when work on that theme is about to begin.

See [roadmap.md](../roadmap.md) for sequencing and dependencies.

## Platform Themes

| Theme | One-liner | Phase |
|-------|-----------|-------|
| **Foundation** | Extract the shared shell, UI library, and modular API that all apps build on | 1 |
| **AI — Categorisation** | Automated data entry, entity matching, tagging across all domains. Infrastructure-level — gets applied to each app to reduce input friction | 2+ |
| **AI — Overlay** | Contextual assistant in the shell. Interactive — "help me do it." Query across domains, suggest actions, answer questions | 3 |
| **AI — Inference** | Proactive monitoring, anomaly detection, smart automations. Autonomous — "do it for me." Moltbot alerts, scheduled analysis | 3 |
| **Mobile** | Native iOS app and wall-mounted dashboard/HomePad mode | 5 |

## Retroactive Specs

| Theme | One-liner | Phase |
|-------|-----------|-------|
| **Finance — Product Spec** | Document what finance does as a product: data model, user flows, import pipeline, entity matching. Implementation-agnostic — survives a rewrite. [Fully specced](finance-spec/README.md) | — |

## App Themes

| Theme | One-liner | Phase |
|-------|-----------|-------|
| **[AI](ai/README.md)** | AI operations app — usage tracking, model config, categorisation rules. Grows into the hub for all AI capabilities | 2+ |
| **Media** | Movies and TV show tracking, preference learning, recommendations. Plex/Radarr/Sonarr/TMDB/TheTVDB integration | 2 |
| **Inventory** | Home inventory — connectivity graph, hierarchical locations, photos, Paperless-ngx receipts, insurance reports. Highest daily-use app. [Fully specced](inventory/README.md) | 2 |
| **Finance** | Polish existing finance app, reduce friction, add subscriptions tracking as a built-in feature | 2 |
| **Fitness** | Gym and training log — exercises, sets, reps, progress. Health integrations (Apple Health, meals) come later | 2 |
| **Documents** | Surfaces Paperless-ngx within POPS. Links receipts, warranties, manuals to items and transactions | 2 |
| **Travel** | Trip planning, organising, tracking. Links to finance (budgets), documents (bookings) | 4 |
| **Books** | Reading tracker — reading list, reviews, recommendations. Same pattern as media | 4 |
| **Recipes** | Ingredients, recipes, meal planning. Links to finance (grocery spend), inventory (kitchen gear) | 4 |
| **Maintenance** | Tasks, chores, scheduled reminders. Service schedules, renewals, recurring to-dos. Closer to Todoist than inventory | 6 |
| **Social** | Contacts, gift tracking, event planning. CRM-lite for personal relationships | 6 |
| **Home Automation** | HomeAssistant integration. Explore only if there's a clear gap | 6 |
