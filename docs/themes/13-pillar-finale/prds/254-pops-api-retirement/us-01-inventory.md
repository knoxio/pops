# US-01: Relocate inventory handlers to `pops-inventory-api`

> Parent: [PRD-254](README.md)

## Surface

`apps/pops-api/src/modules/inventory/` → `apps/pops-inventory-api/src/modules/`

| Subdir            | Notes                                      | Cross-pillar deps              |
| ----------------- | ------------------------------------------ | ------------------------------ |
| `items/`          | items CRUD; main inventory surface         | none                           |
| `locations/`      | location tree CRUD                         | none                           |
| `photos/`         | item photo upload + retrieval              | none                           |
| `documents/`      | inventory document records                 | uses `paperless/`              |
| `document-files/` | file blobs for documents                   | none                           |
| `reports/`        | inventory reporting endpoints              | none (reads only inventory-db) |
| `paperless/`      | paperless-ngx integration glue             | external HTTP only             |
| `connections/`    | inventory connections to external services | external HTTP only             |

9 routers, 54 files, 21 H8 violations.

## Parallelisable sub-PRs

| #   | Slice                                        |               Files | Notes                         |
| --- | -------------------------------------------- | ------------------: | ----------------------------- |
| 01a | `locations/` + `items/`                      |           core CRUD | first slice — proves the path |
| 01b | `photos/` + `documents/` + `document-files/` |      media-adjacent | second slice                  |
| 01c | `paperless/` + `connections/` + `reports/`   | externals + reports | last slice                    |

Each sub-PR drops its own H8 entries.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/inventory/` is empty
- [ ] `apps/pops-inventory-api/src/router.ts` mounts all inventory feature routers
- [ ] 21 inventory H8 entries removed from `.dependency-cruiser-known-violations.json`
- [ ] `pnpm --filter @pops/inventory-api typecheck/test/build` clean
- [ ] `pnpm --filter @pops/api typecheck/test/build` clean (the deleted modules don't break anything)
- [ ] `pnpm typecheck/lint/lint:boundaries` clean
- [ ] Husky hooks pass
- [ ] nginx `/trpc-inventory/*` smoke OK on capivara post-deploy
