# Pillar contract scaffold

> Theme: [Federation](../../README.md)

## Purpose

Every pillar carries its own wire contract **inside the pillar**, not in a separate package. The contract is a ts-rest + zod router (`src/contract/rest.ts`) that is the single source of truth for the pillar's HTTP surface. Two committed artefacts are projected from it: an OpenAPI JSON snapshot (`openapi/<id>.openapi.json`) for polyglot codegen, and a zero-runtime TypeScript types module (`api-types.generated.ts`) for TS consumers. A generated structural snapshot type (`<Pillar>Contract`) captures the public entity + error surface.

There is **no** `@pops/<pillar>-contract` package and **no** `@pops/<pillar>-db` runtime package. A pillar publishes exactly one workspace package, `@pops/<id>`, whose `files` allowlist ships only the compiled contract (`dist/contract/**`) and the OpenAPI snapshot. Consumers depend on `@pops/<id>` and import types from its barrel; the server-internal runtime (db, handlers, server) never crosses the dependency boundary because it is excluded from the published files.

Rust pillars (e.g. `contacts`) follow the same contract shape over axum + utoipa, emitting an identically-committed `openapi/<id>.openapi.json` from an `emit-openapi` binary.

## Data model — contract directory layout

```
pillars/<id>/
├── package.json                       # name: @pops/<id>; files: dist/contract/**, openapi/<id>.openapi.json
├── tsconfig.build.json                # composite build; excludes __tests__ and scripts
├── openapi/
│   └── <id>.openapi.json              # generated, committed; consumed by polyglot codegen + GET /openapi
├── scripts/
│   ├── generate-openapi.ts            # ts-rest contract -> openapi/<id>.openapi.json
│   ├── generate-api-types.ts          # openapi JSON -> src/contract/api-types.generated.ts
│   ├── generate-manifest.ts           # entity + error exports -> manifest.generated.ts
│   └── verify-manifest.ts             # re-render + oxfmt in memory, byte-compare (CI gate)
└── src/
    └── contract/
        ├── index.ts                   # barrel — the public surface consumers import
        ├── rest.ts                    # ts-rest c.router(...) — SINGLE source of truth for the wire
        ├── rest-<domain>.ts           # per-domain sub-contracts composed into rest.ts
        ├── rest-schemas.ts            # shared zod request/response schemas
        ├── types/                     # hand-maintained TS entity types
        │   ├── index.ts
        │   └── <entity>.ts
        ├── schemas/                   # zod validators, 1:1 with types/
        │   ├── index.ts
        │   └── <entity>.ts
        ├── errors.ts                  # ContractStatus + per-pillar domain error union (+ zod)
        ├── router.ts                  # opaque router type (= unknown); no tRPC crosses the boundary
        ├── manifest.ts                # re-exports <Pillar>Contract + runtime ModuleManifest value
        ├── manifest.generated.ts      # generated <Pillar>Contract structural snapshot type
        ├── api-types.generated.ts     # generated zero-runtime paths/components for openapi-fetch
        ├── settings/                  # per-pillar SettingsManifest (when the pillar owns settings)
        └── __tests__/
            ├── schemas.test.ts        # round-trip: z.infer<Schema> ≡ Type
            ├── manifest.test.ts       # <Pillar>Contract entity slots ≡ types + drift byte-check
            └── openapi.test.ts        # structural invariants on the committed openapi JSON
```

### `package.json` shape (TS pillar)

```jsonc
{
  "name": "@pops/<id>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "files": ["dist/contract/**", "openapi/<id>.openapi.json"],
  "main": "./dist/contract/index.js",
  "types": "./dist/contract/index.d.ts",
  "exports": {
    ".": { "types": "./dist/contract/index.d.ts", "default": "./dist/contract/index.js" },
    "./manifest": {
      "types": "./dist/contract/manifest.d.ts",
      "default": "./dist/contract/manifest.js",
    },
    "./api-types": {
      "types": "./dist/contract/api-types.generated.d.ts",
      "default": "./dist/contract/api-types.generated.js",
    },
    "./openapi": "./openapi/<id>.openapi.json",
    "./package.json": "./package.json",
  },
  "scripts": {
    "build": "tsx scripts/verify-manifest.ts && tsc -b tsconfig.build.json && tsx scripts/generate-openapi.ts && tsx scripts/generate-api-types.ts",
    "generate:manifest": "tsx scripts/generate-manifest.ts",
    "verify:manifest": "tsx scripts/verify-manifest.ts",
    "generate:openapi": "tsx scripts/generate-openapi.ts",
    "generate:api-types": "tsx scripts/generate-api-types.ts",
  },
  "dependencies": {
    "@pops/pillar-sdk": "workspace:*",
    "@pops/types": "workspace:*",
    "@ts-rest/core": "3.53.x",
    "@ts-rest/express": "3.53.x",
    "@ts-rest/open-api": "3.53.x",
    "zod": "^4.x",
  },
  "devDependencies": {
    "openapi-typescript": "^7.x",
    "tsx": "^4.x",
    "vitest": "^4.x",
  },
}
```

The boundary is enforced by the `files` allowlist, not by a split package: `better-sqlite3`, `drizzle-orm`, `express`, handlers and the server live in the same package and the same `dependencies`, but `dist/db/**`, `dist/api/**` and `dist/api/server.js` are simply not packaged. A consumer that adds `@pops/<id>` resolves only the contract barrel + manifest + api-types + the OpenAPI JSON.

## Contract surface (public exports of `@pops/<id>`)

| Import path            | Contents                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pops/<id>` (barrel)  | All entity types, zod schemas, error types/schemas, the `<Pillar>Router` and `<Pillar>Contract` types, plus any browser-consumable pure helpers the app shares (e.g. finance's correction-merge functions).         |
| `@pops/<id>/manifest`  | The `<Pillar>Contract` structural snapshot **type** and the runtime `ModuleManifest` **value** (`id`, `name`, `version`, `surfaces`, `description`, `settings`, …) that the registry serves and the shell consumes. |
| `@pops/<id>/api-types` | Generated `paths` / `components` types (zero runtime). Consumers compose with `openapi-fetch` / Hey API for fully typed HTTP calls without importing anything server-internal.                                      |
| `@pops/<id>/openapi`   | The committed OpenAPI JSON. Polyglot consumers (Rust, Swift) codegen from this; `GET /openapi` on the live pillar serves the same bytes verbatim so the pillar SDK can build its operationId route map.             |

The barrel re-exports `types/index.js`, `schemas/index.js`, `errors.js`, the `<Pillar>Router` type, and the `<Pillar>Contract` type.

### `<Pillar>Router` is opaque

REST pillars have no concrete tRPC router to surface, so `router.ts` exports `export type <Pillar>Router = unknown`. Consumers calling `pillar('<id>')` through the SDK get a fully opaque `PillarHandle`; the typed-call path is the generated `api-types` + OpenAPI, not a serialised router type. The name is retained only because the generated manifest references it as the `router` field type.

### `<Pillar>Contract` snapshot

`manifest.generated.ts` declares a structural snapshot of the public surface:

```ts
export interface FinanceContract {
  readonly pillar: 'finance';
  readonly version: string;
  readonly entities: { readonly budget: Budget; readonly transaction: Transaction /* … */ };
  readonly errors: FinanceError;
  readonly router: FinanceRouter; // = unknown
}
```

It is generated from the per-entity `types/` + `errors.ts` exports plus the `package.json` version — never hand-maintained. The generator imports each named entity/error type so a renamed or missing export fails codegen loudly instead of emitting a stale manifest.

## Generation pipeline

1. **`rest.ts`** composes per-domain ts-rest sub-contracts (`c.router({ … }, { pathPrefix: '', strictStatusCodes: false })`) into one contract. This is the only place the wire surface is declared — no hand-authored OpenAPI, no hand-authored paths.
2. **`generate-openapi.ts`** runs `generateOpenApi(contract, …)` with a zod-4 schema transformer (`z.toJSONSchema({ target: 'openapi-3.0' })`, since the bundled transformer only understands zod 3), hoists nested `$defs`/`definitions` into `components.schemas` with rewritten `$ref`s, recursively sorts keys, runs `oxfmt`, and writes `openapi/<id>.openapi.json`. Deterministic output makes `generate:openapi && git diff --exit-code` a stable drift check.
3. **`generate-api-types.ts`** feeds the committed JSON through `openapi-typescript`, prepends an autogenerated header, runs `oxfmt`, and writes `src/contract/api-types.generated.ts`. Its own drift check is `generate:api-types && git diff --exit-code`.
4. **`generate-manifest.ts`** renders `manifest.generated.ts` from the entity/error exports + version; **`verify-manifest.ts`** re-renders + oxfmts in memory and byte-compares, gating the build.
5. Rust pillars run an `emit-openapi` binary (utoipa) to produce the same committed `openapi/<id>.openapi.json` with no TS pipeline.

Build order: `verify:manifest` → `tsc -b` → `generate:openapi` → `generate:api-types`.

## Rules

- **Contract lives in the pillar.** One package per pillar, `@pops/<id>`. No `-contract` and no `-db` sibling packages; no shared "common" contract.
- **ts-rest is the single source of truth.** `rest.ts` is the only description of the wire format. OpenAPI and `api-types` are pure projections; never hand-author either, never hand-author paths elsewhere.
- **No runtime crosses the boundary.** The `files` allowlist ships only `dist/contract/**` + the OpenAPI JSON. Server, db, and handlers stay unpackaged, so consumers can never transitively import the runtime.
- **Consumers depend on `@pops/<id>` and import from the barrel** (`import type { Transaction } from '@pops/finance'`), or from `./manifest` / `./api-types` for the snapshot type / wire types.
- **Zod schemas and TS types must agree.** `schemas.test.ts` asserts `expectTypeOf<z.infer<typeof XSchema>>().toEqualTypeOf<X>()` per entity. Adding an entity means adding both a `types/<entity>.ts` and a matching `schemas/<entity>.ts`.
- **Generated artefacts are committed and drift-checked.** `openapi/<id>.openapi.json`, `api-types.generated.ts`, and `manifest.generated.ts` are committed; per-pillar quality CI re-runs each generator and fails on a non-empty `git diff`.
- **`<Pillar>Contract` is auto-generated**, not hand-written. The manifest test byte-checks the committed file against a fresh render.
- **Polyglot parity.** Rust pillars expose the same contract shape and commit an identical OpenAPI JSON via utoipa.

## Edge cases

| Case                                                            | Behaviour                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract references a zod schema not exported from `schemas/`   | Build fails: the schema isn't projectable, so `generate-openapi.ts` errors before writing. Move the schema into the contract first.                                                                           |
| Two pillars need an overlapping entity (e.g. both have a `Tag`) | Each defines its own under its `types/`. Cross-pillar references go through the URI layer (`pops:<id>/<type>/<id>`), never via a shared type. Lift into `@pops/types` only if genuinely identical primitives. |
| Pillar runtime not ready but contract is                        | The contract barrel builds, `schemas`/`manifest`/`openapi` tests pass standalone. A call to the pillar via the SDK returns `{ kind: 'unavailable' }`.                                                         |
| Zod schema changes without the TS type (or vice versa)          | `schemas.test.ts` round-trip fails: schema and type are out of sync for that entity. Fix both.                                                                                                                |
| Committed OpenAPI drifts from the contract                      | `generate:openapi && git diff --exit-code` in CI fails; deterministic sort + oxfmt make the diff meaningful. Same pattern for `api-types` and `manifest`.                                                     |
| iOS Swift / Rust client needs a wire type                       | Codegen reads `openapi/<id>.openapi.json` directly (Stoplight-browseable via the `docs` pillar). TS consumers use `api-types` + `openapi-fetch`.                                                              |
| Generated manifest names a removed/renamed export               | `generate-manifest.ts` imports each named entity/error type, so codegen fails loudly rather than emitting a broken snapshot.                                                                                  |

## Acceptance criteria

- [x] Each pillar owns its contract under `pillars/<id>/src/contract/` with `index.ts`, `rest.ts`, `types/`, `schemas/`, `errors.ts`, `manifest.ts` (verified: finance, media, food, inventory, lists, cerebrum, registry). `router.ts` is present on finance, media, food, inventory, and registry; lists and cerebrum have none and reference their contract directly. The `ai` pillar carries a thinner contract — `index.ts`, `rest.ts`, `rest-*` sub-contracts, and a runtime-only `manifest.ts` — with no `types/`, `schemas/`, `errors.ts`, `router.ts`, or `manifest.generated.ts`.
- [x] The pillar publishes one `@pops/<id>` package whose `files` allowlist ships only `dist/contract/**` + `openapi/<id>.openapi.json`; `exports` expose `.`, `./manifest`, `./api-types`, `./openapi`.
- [x] `rest.ts` is a ts-rest `c.router(...)` composed from per-domain sub-contracts; it is the sole wire declaration.
- [x] Where a pillar ships `router.ts`, it exports an opaque `<Pillar>Router = unknown` (no runtime router type crosses the boundary) — verified on finance, media, food, inventory. The registry pillar instead aliases its ts-rest contract (`CoreRouter = CoreRestContract`) rather than `unknown`; lists, cerebrum, and ai ship no `router.ts` at all.
- [x] `errors.ts` exports the shared `ContractStatus` (`ok | not-found | unavailable | degraded`) plus a per-pillar domain error union, each with a matching zod schema.
- [x] `generate-openapi.ts` projects the ts-rest contract to a deterministic, committed `openapi/<id>.openapi.json` (sorted keys + oxfmt); `GET /openapi` serves it verbatim (smoke-tested).
- [x] `generate-api-types.ts` projects the committed OpenAPI JSON to a zero-runtime `api-types.generated.ts` via `openapi-typescript`.
- [x] `<Pillar>Contract` snapshot type lives in `manifest.generated.ts`, auto-generated from the entity/error exports; `manifest.ts` re-exports it alongside the runtime `ModuleManifest` value (verified: finance, media, food, inventory, lists, cerebrum, registry). The `ai` pillar's `manifest.ts` carries only the runtime `ModuleManifest` value — it has no `manifest.generated.ts` and no `AiContract` snapshot type.
- [x] Round-trip test asserts `z.infer<typeof XSchema> ≡ X` per entity (`schemas.test.ts`).
- [x] Manifest + OpenAPI structural tests guard the committed artefacts (`manifest.test.ts`, `openapi.test.ts`). Coverage is in the contract `__tests__/` on the full-layout pillars (food, inventory, lists, cerebrum); registry names its manifest guard `module-manifest.test.ts`, and finance/media keep their OpenAPI smoke test under `src/api/__tests__/openapi.test.ts` rather than the contract layer.
- [x] `generate-manifest.ts` + `verify-manifest.ts` render and byte-check the manifest; `verify:manifest` gates `build` (verified: lists, inventory, food, cerebrum).
- [x] Rust pillars (contacts) emit an identically-committed `openapi/<id>.openapi.json` via a utoipa `emit-openapi` binary.
- [x] Consumers depend on `@pops/<id>` and import types from the barrel (verified: `pillars/finance/app` imports `Transaction`, `Correction`, etc. from `@pops/finance`).
- [ ] Every pillar carries the manifest generator pair — **finance ships a committed `manifest.generated.ts` but has no `generate-manifest.ts` / `verify-manifest.ts` and does not gate its build on `verify:manifest`**. See [idea: contract scaffold tooling](../../../../ideas/contract-package-scaffold.md).
- [ ] A `gen:contract <pillar>` scaffold command exists to stamp the layout for a new pillar — **not built; all contracts are hand-authored to the same shape**. See the idea note.

## Out of scope

- Contract semver / public-surface diff CI — separate PRD (`contract-semver-ci`).
- Registry runtime mechanics (self-registration, heartbeat, snapshot, SSE) — central registry epic.
- The `docs` pillar's Stoplight Elements browser over every committed OpenAPI snapshot — its own PRD; this PRD only guarantees the snapshots exist and are committed.
- Lint rule forbidding non-owning imports of server-internal paths — consumer-import-discipline PRD (the `files` allowlist already makes the runtime physically unresolvable).
- iOS Swift codegen pipeline — Mobile theme; this PRD only emits the OpenAPI the codegen consumes.
- npm publish — workspace-only by decision.
