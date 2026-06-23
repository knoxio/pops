# Idea: Radarr request-management extensions

The single-movie request flow is shipped (request modal + button across detail/search/discovery, env-only config). These extensions were explicitly out of scope and remain unbuilt. The download queue today is read-only display (`DownloadQueue` + `GET /arr/queue`); there is no mutate-the-queue API.

## What to build

- **Bulk requesting** — select multiple movies (e.g. from search results or a discovery shelf) and request them in one action against a shared quality profile + root folder, with per-item success/failure reporting.
- **Download-queue management** — pause, resume, cancel, and reprioritise active downloads from inside POPS. Needs new Radarr command/queue routes (`POST /api/v3/command` for queue ops, `DELETE /api/v3/queue/:id`) surfaced through the `arr.*` sub-router, plus controls on the `DownloadQueue` component.
- **Quality-profile management** — create/edit Radarr quality profiles from POPS (proxying `POST/PUT /api/v3/qualityprofile`) rather than only listing them.
- **Tag management** — assign and manage Radarr tags on requested movies.

## Why it is not built

The request feature's goal is replacing Overseerr's _request_ surface; it deliberately stops at "add monitored + auto-search". Queue mutation, bulk flows, and profile/tag CRUD are admin-shaped operations that the Radarr web UI already covers, so they were deferred until there is real demand to drive them from POPS. Each requires new contract routes (none of these mutate operations exist server-side today) and corresponding UI.
</content>
