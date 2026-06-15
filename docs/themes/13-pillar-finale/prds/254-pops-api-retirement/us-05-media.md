# US-05: Relocate media handlers to `pops-media-api`

> Parent: [PRD-254](README.md)

## Surface

`apps/pops-api/src/modules/media/` → `apps/pops-media-api/src/modules/`

| Subdir               | Notes                         | Cross-pillar deps                                      |
| -------------------- | ----------------------------- | ------------------------------------------------------ |
| `arr/`               | Sonarr / Radarr integration   | **already calls core settings via SDK** (PRD-247)      |
| `comparisons/`       | comparison engine             | none (debrief consumer was ripped per debrief removal) |
| `discovery/`         | discovery feed builders       | external HTTP + plex via SDK                           |
| `library/`           | library state CRUD            | plex via SDK                                           |
| `lib/`               | shared utilities              | none                                                   |
| `movies/`            | movie metadata + state        | tmdb/thetvdb external HTTP                             |
| `plex/`              | Plex integration              | **already calls core settings via SDK** (PRD-247)      |
| `rotation/`          | rotation cycle                | **already calls core settings via SDK** (PRD-247)      |
| `search/`            | media search                  | external HTTP                                          |
| `thetvdb/` + `tmdb/` | metadata adapters             | external HTTP                                          |
| `tv-shows/`          | TV show metadata + state      | tmdb/thetvdb                                           |
| `uri-handler.ts`     | URI dispatcher                | none                                                   |
| `watch-history/`     | watch tracking + log handlers | **debrief side-effect was removed** (rip-out)          |
| `watchlist/`         | watchlist CRUD + plex push    | plex via SDK                                           |

18 subdirs, 26 routers, 305 files, 99 H8 violations. Largest pillar — last in execution order.

## What's already migrated to SDK

- `arr/` + `rotation/` settings consumption (PRD-247 US-03 #3302)
- `plex/` settings consumption (PRD-247 US-03 plex slice, PR #3320)
- `watch-history` mixed-tx → cerebrum was removed (debrief rip-out, PR #3321)

What's left to migrate is the **DB-import side** — most handlers still import `@pops/media-db` directly from inside pops-api. That's 99 entries to drain.

## Parallelisable sub-PRs

Aggressive slicing recommended. Each ships independently:

| #   | Slice                                                   | Notes                                                         |
| --- | ------------------------------------------------------- | ------------------------------------------------------------- |
| 05a | `movies/` + `tv-shows/`                                 | metadata + state, isolated                                    |
| 05b | `library/`                                              | library state                                                 |
| 05c | `watchlist/`                                            | watchlist CRUD; depends on plex SDK (already exists)          |
| 05d | `watch-history/`                                        | tracking + log handlers                                       |
| 05e | `discovery/` + `search/`                                | feed builders + search                                        |
| 05f | `comparisons/`                                          | comparison engine (post-debrief simplification)               |
| 05g | `arr/` + `plex/` + `rotation/` + `lib/` + `uri-handler` | remaining (already SDK-flipped for settings; just relocation) |
| 05h | `thetvdb/` + `tmdb/`                                    | metadata adapters                                             |

8 sub-PRs; up to 4-6 can run in parallel agents.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/media/` is empty
- [ ] `apps/pops-media-api/src/router.ts` mounts all media feature routers
- [ ] 99 media H8 entries removed from `.dependency-cruiser-known-violations.json`
- [ ] `pnpm --filter @pops/media-api typecheck/test/build` clean
- [ ] `pnpm --filter @pops/api typecheck/test/build` clean
- [ ] `pnpm typecheck/lint/lint:boundaries` clean
- [ ] Husky hooks pass
- [ ] nginx `/trpc-media/*` smoke OK on capivara
- [ ] Plex sync end-to-end (smoke, not full e2e)
- [ ] Sonarr/Radarr add-movie/add-show end-to-end (smoke)
