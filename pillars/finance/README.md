# @pops/finance

Collapsed finance pillar: SQLite persistence (`src/db`), the public contract
surface (`src/contract`), and the REST API container (`src/api`) in one
workspace member.

The wire surface is a [ts-rest](https://ts-rest.com) contract
(`src/contract/rest.ts`). `pnpm -F @pops/finance generate:openapi` projects it
to `openapi/finance.openapi.json`; `generate:api-types` projects that JSON to
`src/contract/api-types.generated.ts`. The contract is the single source of
truth — no hand-authored OpenAPI, no hand-authored paths.

The container serves REST at the pillar's own port (`3004`), opening its own
`finance.db` via `openFinanceDb`. It trusts the docker network: the
dispatcher/gateway in front authenticates, so there is no per-request auth here
(parity with lists / inventory / food).

## Domains

| Domain                      | Routes                                                        | Status        |
| --------------------------- | ------------------------------------------------------------- | ------------- |
| `wishlist`                  | `/wishlist`, `/wishlist/:id`                                  | REST          |
| `budgets`                   | `/budgets`, `/budgets/:id`                                    | REST          |
| `transactions`              | `/transactions`, `/transactions/:id`, `/transactions/restore` | REST          |
| `imports`                   | —                                                             | not yet moved |
| `tag-suggester`/`tag-rules` | —                                                             | not yet moved |

## Scripts

- `build` — `tsc` + regenerate OpenAPI + regenerate api-types.
- `dev` — watch-run the API server.
- `test` — vitest (db services + REST integration via supertest).
- `generate:openapi` / `generate:api-types` — regenerate the committed
  projections (drift-checked in CI).
