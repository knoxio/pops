# @pops/media

The **media** pillar — movies, TV, watchlist, watch history, and the
Plex/TMDB/TVDB integrations. A standalone REST service that owns its own SQLite
DB, serves a [ts-rest](https://ts-rest.com) contract built from zod, exports a
`./manifest`, and self-registers with the `registry` pillar on boot. Port
**3003**.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe types + zod schemas
    "./manifest": → src/contract/manifest.ts     // pillar manifest
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/media.openapi.json    // canonical wire contract
  }
```

The contract (`src/contract/rest.ts`) is the single source of truth.
`generate:openapi` projects it to `openapi/media.openapi.json`;
`generate:api-types` projects that JSON to `api-types.generated.ts`. No
hand-authored OpenAPI, no hand-authored paths; CI gates on drift.

## Layout

```
pillars/media/
├── package.json            @pops/media
├── Dockerfile              runs src/api/server.ts
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-media — FE feature module
├── openapi/
│   └── media.openapi.json  generated projection of the contract
├── migrations/             in-package drizzle migrations + journal
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, entity types/schemas, settings manifests, error envelopes
    ├── api/        PRIVATE: Express app, ts-rest handlers, health/pillars probes, server
    └── db/         PRIVATE: drizzle schema + services + the SQLite opener
```

## Wire surface

The pillar serves two paths fronted by the gateway/nginx:

- `/media-api/*` — the REST data surface (this contract).
- `/media/images/*` — a non-contract Express byte route over `MEDIA_IMAGES_DIR`.

There is no per-request auth: the pillar trusts the docker network and the
gateway in front authenticates.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`.

## Commands

```bash
pnpm --filter @pops/media typecheck
pnpm --filter @pops/media test
pnpm --filter @pops/media build              # tsc + generate openapi + api-types
pnpm --filter @pops/media dev                # tsx watch on src/api/server.ts
pnpm --filter @pops/media generate:openapi
pnpm --filter @pops/media generate:api-types
```
