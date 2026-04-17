# Themes

Each theme is a strategic initiative grouping related epics. Themes persist across phases. Detailed theme READMEs are written when work on that theme is about to begin.

See [roadmap.md](../roadmap.md) for sequencing, dependencies, and implementation status.

## Platform Themes

| Theme                                             | One-liner                                                                                       | Phase | Status                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----- | --------------------------------------------- |
| **[Infrastructure](00-infrastructure/README.md)** | Provision the hardware, networking, deployment pipeline, and CI/CD that runs everything         | 0     | Done                                          |
| **[Foundation](01-foundation/README.md)**         | Build the shared shell, UI library, modular API, and DB patterns that all apps run on           | 1     | Done (Drizzle migration pending)              |
| **AI — Categorisation**                           | Automated data entry, entity matching, tagging across all domains                               | 2+    | Partial (finance done, other domains pending) |
| **AI — Overlay**                                  | Superseded by Cerebrum Epic 05 (Ego)                                                            | —     | Superseded                                    |
| **[Cerebrum](06-cerebrum/README.md)**             | Personal cognitive infrastructure — self-curating knowledge base that compounds over a lifetime | 2-3   | Not started                                   |
| **AI — Inference**                                | Proactive monitoring, anomaly detection, smart automations. Moltbot alerts, scheduled analysis  | 3     | Not started                                   |
| **Mobile**                                        | Native iOS app and wall-mounted dashboard/HomePad mode                                          | 5     | Not started                                   |

## App Themes

| Theme                                   | One-liner                                                                                                      | Phase | Status                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------- |
| **[Finance](02-finance/README.md)**     | Budgeting, transaction tracking, wishlist, bank imports, AI categorisation                                     | 2     | Done (product spec not yet written) |
| **[Media](03-media/README.md)**         | Movies and TV show tracking, preference learning, recommendations. Plex/Radarr/Sonarr/TMDB/TheTVDB             | 2     | Done                                |
| **[Inventory](04-inventory/README.md)** | Home inventory — connectivity graph, hierarchical locations, photos, Paperless-ngx receipts, insurance reports | 2     | Done                                |
| **[AI Operations](05-ai/README.md)**    | AI usage tracking, model config, categorisation rules. Hub for all AI capabilities                             | 2+    | Partial                             |
| **Fitness**                             | Gym and training log — exercises, sets, reps, progress                                                         | 2     | Not started                         |
| **Documents**                           | Surfaces Paperless-ngx within POPS. Links receipts, warranties, manuals to items and transactions              | 2     | Not started                         |
| **Travel**                              | Trip planning, organising, tracking. Links to finance (budgets), documents (bookings)                          | 4     | Not started                         |
| **Books**                               | Reading tracker — reading list, reviews, recommendations. Same pattern as media                                | 4     | Not started                         |
| **Recipes**                             | Ingredients, recipes, meal planning. Links to finance (grocery spend), inventory (kitchen gear)                | 4     | Not started                         |
| **Maintenance**                         | Tasks, chores, scheduled reminders. Service schedules, renewals, recurring to-dos                              | 6     | Not started                         |
| **Social**                              | Contacts, gift tracking, event planning. CRM-lite for personal relationships                                   | 6     | Not started                         |
| **Home Automation**                     | HomeAssistant integration. Explore only if there's a clear gap                                                 | 6     | Not started                         |
