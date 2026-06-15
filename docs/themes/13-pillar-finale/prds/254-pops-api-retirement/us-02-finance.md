# US-02: Relocate finance handlers to `pops-finance-api`

> Parent: [PRD-254](README.md)

## Surface

`apps/pops-api/src/modules/finance/` → `apps/pops-finance-api/src/modules/`

| Subdir           | Notes                          | Cross-pillar deps                         |
| ---------------- | ------------------------------ | ----------------------------------------- |
| `transactions/`  | transaction CRUD + queries     | none                                      |
| `budgets/`       | budget CRUD + analytics        | none                                      |
| `imports/`       | bank-statement import pipeline | **may call cerebrum** (AI categorisation) |
| `tag-suggester/` | tag-suggestion service         | **calls cerebrum** AI                     |
| `wishlist/`      | wishlist CRUD                  | none                                      |

4 routers (one per family except `uri-handler.ts` at root), 71 files, 39 H8 violations.

## Cross-pillar SDK calls needed

- `imports/` and `tag-suggester/` call cerebrum AI for categorisation
- SDK procedures should already exist (PRD-244 / cerebrum AI surface). If a specific call is missing, flag as precursor.

## Parallelisable sub-PRs

| #   | Slice                                      |                   Files | Notes                              |
| --- | ------------------------------------------ | ----------------------: | ---------------------------------- |
| 02a | `transactions/` + `budgets/` + `wishlist/` |            pure finance | safest first slice                 |
| 02b | `imports/`                                 | needs cerebrum SDK flip | confirm SDK first; mock if needed  |
| 02c | `tag-suggester/`                           | needs cerebrum SDK flip | depends on 02b's SDK confirmations |

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/finance/` is empty
- [ ] `apps/pops-finance-api/src/router.ts` mounts all finance feature routers
- [ ] 39 finance H8 entries removed from `.dependency-cruiser-known-violations.json`
- [ ] `pnpm --filter @pops/finance-api typecheck/test/build` clean
- [ ] `pnpm --filter @pops/api typecheck/test/build` clean
- [ ] `pnpm typecheck/lint/lint:boundaries` clean
- [ ] Husky hooks pass
- [ ] nginx `/trpc-finance/*` smoke OK on capivara post-deploy
- [ ] Bank-import e2e (or unit-test equivalent) proves the cerebrum SDK flip works
