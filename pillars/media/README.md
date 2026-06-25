# @pops/media

The **media** pillar — movies, TV shows, watchlist, watch history, pairwise
ratings, discovery/recommendations, and the Plex/TMDB/TheTVDB/Radarr/Sonarr
integrations. A standalone REST service that owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports a `./manifest`,
and self-registers with the `registry` pillar on boot. Default port **3003**
(override with `PORT`).

Domain docs: [docs/README.md](docs/README.md).

## Public surface

Consumers import the published, front-end-safe types and schemas — never the
private server/db internals. Exports resolve to the built `dist/` output:

| Import                  | Resolves to                            | Contents                                                          |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `@pops/media`           | `dist/contract/index.js`               | entity types, zod schemas, error envelopes, contract/router types |
| `@pops/media/manifest`  | `dist/contract/manifest.js`            | the runtime `mediaManifest` value + `MediaContract` type          |
| `@pops/media/api-types` | `dist/contract/api-types.generated.js` | OpenAPI-derived request/response types                            |
| `@pops/media/openapi`   | `openapi/media.openapi.json`           | canonical wire contract (JSON)                                    |

`src/contract/rest.ts` (`mediaContract`) is the single source of truth.
`generate:openapi` projects it to `openapi/media.openapi.json`;
`generate:api-types` projects that JSON to `api-types.generated.ts`. No
hand-authored OpenAPI, no hand-authored paths; CI gates on drift.

## Layout

```
pillars/media/
├── package.json            @pops/media
├── Dockerfile              runs dist/api/server.js
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-media — front-end feature module
├── openapi/
│   └── media.openapi.json  generated projection of the contract
├── migrations/             drizzle migrations + journal
├── scripts/                generate-openapi.ts, generate-api-types.ts
├── docs/                   domain docs (Theme + PRDs)
└── src/
    ├── contract/   PUBLIC: ts-rest contract, entity types/schemas, settings manifests, error envelopes
    ├── api/        PRIVATE: Express app, ts-rest handlers, health/pillars/openapi probes, schedulers, server
    └── db/         PRIVATE: drizzle schema + services + the SQLite opener
```

## Wire surface

The Express app mounts:

- the REST contract endpoints (the surface described by `src/contract/rest.ts`),
- `GET /health` and `GET /pillars` probes,
- `GET /openapi`, serving the committed projection verbatim so the pillar SDK
  builds its route map from the live pillar,
- `/media/images/*` — a non-contract byte route over `MEDIA_IMAGES_DIR`, mounted
  after the contract endpoints so it contributes no OpenAPI paths.

There is no per-request auth: the pillar trusts the docker network and the
gateway in front authenticates.

## Schedulers

The server runs two module-level schedulers whose REST toggle/run-now handlers
drive the same timers:

- Plex sync — force-started with `PLEX_SCHEDULER_ENABLED=true`, otherwise
  auto-resumes from the persisted `plex_scheduler_enabled` flag.
- Library rotation — force-started with `MEDIA_ROTATION_SCHEDULER_ENABLED=true`,
  otherwise auto-resumes from the persisted `rotation_enabled` flag.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk/bootstrap` and deregisters on `SIGTERM`
/ `SIGINT`. `MEDIA_SELF_BASE_URL` (default `http://localhost:<PORT>`) sets the
advertised base URL.

## Commands

```bash
pnpm --filter @pops/media typecheck
pnpm --filter @pops/media test
pnpm --filter @pops/media build              # tsc + generate openapi + api-types
pnpm --filter @pops/media dev                # tsx watch on src/api/server.ts
pnpm --filter @pops/media start              # node dist/api/server.js
pnpm --filter @pops/media generate:openapi
pnpm --filter @pops/media generate:api-types
```

The same tasks are available through `mise` (`build`, `typecheck`, `test`,
`lint`, `dev`, `start`).
