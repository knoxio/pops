# @pops/media

Collapsed media pillar — REST over a ts-rest contract, its own SQLite, and a
self-contained Docker image (port 3003). Mirrors the finance / inventory /
food pillar shape.

```
src/
  contract/   ts-rest contract (rest.ts) + generated OpenAPI/api-types,
              entity types/schemas, settings manifests, error envelopes
  db/         drizzle schema + services (relocated @pops/media-db)
  api/        Express app, ts-rest handlers, health/pillars probes, server
scripts/      generate-openapi.ts, generate-api-types.ts
openapi/      media.openapi.json (generated projection of the contract)
migrations/   in-package drizzle migrations + journal
```

## Commands

```
pnpm --filter @pops/media typecheck
pnpm --filter @pops/media test
pnpm --filter @pops/media build              # tsc + generate openapi + api-types
pnpm --filter @pops/media generate:openapi   # regenerate the OpenAPI snapshot
pnpm --filter @pops/media generate:api-types # regenerate api-types.generated.ts
pnpm --filter @pops/media dev                # tsx watch on src/api/server.ts
```

The migration is incremental — domains move from the pops-api monolith /
`pops-media-api` into `src/api` one slice at a time, each keeping the scoped
`media-quality.yml` CI green. The rest of the lake stays red-by-design until
consumers cut over to `@pops/media`.

## Wire surface

The pillar serves two paths fronted by the dispatcher/nginx:

- `/media-api/*` — the REST data surface (this contract).
- `/media/images/*` — a non-contract Express byte route over
  `MEDIA_IMAGES_DIR` (mounted by a later slice).

There is no per-request auth: the pillar trusts the docker network and the
gateway in front authenticates.
