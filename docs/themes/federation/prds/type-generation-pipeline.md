# Type generation pipeline

> Theme: [Federation](../README.md)
>
> Status: **Partial** — the OpenAPI-to-typed-client pipeline ships and is drift-gated in CI; binding the runtime `pillar()` proxy to generated contract types is deferred (see [idea](../../../ideas/type-generation-pipeline.md)).

## Overview

The build-time pipeline that turns each pillar's wire contract into consumer-side TypeScript types. There is **no shared monolithic codegen and no `declareContracts` augmentation step**: each pillar projects its own contract to a committed OpenAPI document, and each frontend consumer projects that document to a fully typed REST client it owns. The contract is the source of truth; the OpenAPI JSON is the polyglot interchange format; `@hey-api/openapi-ts` is the TS projection.

Three stages, each independently drift-checked:

```
ts-rest+zod contract (or axum/utoipa for Rust)
        │  generate:openapi  /  emit-openapi
        ▼
pillars/<id>/openapi/<id>.openapi.json     ← committed, polyglot source of truth
        │  @hey-api/openapi-ts (per consumer)
        ▼
pillars/<consumer>/.../src/<id>-api/*.gen.ts  ← committed, typed fetch client
```

A consumer importing `<id>-api` gets `types.gen.ts` (every request/response shape), `sdk.gen.ts` (typed operation functions), and `client.gen.ts` (the configured `@hey-api/client-fetch` instance). No hand-written router type, no SDK augmentation.

## Data Model

No persistent data. A build pipeline producing two committed artifact tiers per pillar.

| Artifact                 | Path                                                                                 | Produced by                                                                                    | Source of truth for                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI document         | `pillars/<id>/openapi/<id>.openapi.json`                                             | `pnpm -F @pops/<id> generate:openapi` (TS) / `cargo run -p contacts --bin emit-openapi` (Rust) | The pillar's REST wire surface; consumed by every TS and polyglot client                                                                                                                                                                                                                |
| Typed manifest interface | `pillars/<id>/src/contract/manifest.generated.ts`                                    | `pnpm -F @pops/<id> generate:manifest`                                                         | The compile-time `<Pillar>Contract` interface (`pillar`, `version`, `entities`, `errors`, `router`); re-exported via the stable `manifest.ts` (`@pops/<id>/manifest`) — only some pillars carry this; see [richer manifest type generation](../../../ideas/manifest-type-generation.md) |
| Generated FE client      | `pillars/<consumer>/app/src/<id>-api/*.gen.ts` (and the shell's `src/registry-api/`) | `pnpm -F @pops/app-<consumer> generate:<id>-client` (`@hey-api/openapi-ts`)                    | The consumer's typed call surface against pillar `<id>`                                                                                                                                                                                                                                 |

### Per-consumer clients, not a shared SDK

Each FE consumer owns its own slice of a pillar's surface and generates its own client (e.g. `pillars/finance/app/src/contacts-api/` for finance→contacts, `pillars/shell/src/registry-api/` for shell→registry). This keeps consumers decoupled from siblings and from the producing pillar's folder. A consumer reaches the producer's OpenAPI by one of three routes, never by a sibling-folder relative path into the producer's source: a same-app relative path (a pillar consuming its own app's spec, `../openapi/<id>.openapi.json`); the producer's published `@pops/<id>/openapi` export for a cross-pillar TS producer (the shell consumes `require.resolve('@pops/registry/openapi')`, never a `../../pillars/registry/...` path); or, for the Rust `contacts` producer — which has no npm package to export from — a vendored copy of the published snapshot under the consumer's own `contracts/` dir, kept in lockstep with the canonical spec by a repo-level drift gate (`scripts/ci/check-vendored-contracts.mjs`). finance→contacts takes this third route.

## Pipeline Surface

### Stage 1 — contract → OpenAPI

Each TS pillar defines `generate:openapi` in its `package.json`, run via `tsx scripts/generate-openapi.ts`. The script is a pure projection of the ts-rest contract (`src/contract/rest.ts`) through `@ts-rest/open-api`, with a zod-4 schema transformer (the bundled zod-3 transformer emits empty schemas under zod 4) and a JSON-Schema draft-marker strip for OpenAPI 3.0 safety. Output is deterministic — recursively sorted keys plus an `oxfmt` pass — so `generate:openapi && git diff --exit-code` is a stable drift gate.

The `contacts` pillar is Rust (axum + OpenAPI). Its document is emitted by the `emit-openapi` binary (`cargo run -p contacts --bin emit-openapi`) into the same `pillars/contacts/openapi/contacts.openapi.json` slot, so downstream TS consumers treat it identically.

### Stage 2 — OpenAPI → typed FE client

Each consumer app declares an `openapi-ts.config.ts` (and `generate:<id>-client` script) using `@hey-api/openapi-ts` with the `@hey-api/client-fetch`, `@hey-api/typescript`, and `@hey-api/sdk` plugins:

```ts
// pillars/<consumer>/app/openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/<id>.openapi.json', // same-app; or require.resolve('@pops/<id>/openapi') cross-pillar; or a vendored ./contracts/<id>.openapi.json for the Rust `contacts` producer
  output: { path: 'src/<id>-api' },
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/<id>-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
```

A consumer that talks to more than one pillar carries one config per producer (e.g. finance app: `openapi-ts.config.ts` for finance + `openapi-ts.contacts.config.ts` for contacts; food app: food + lists; ai app: ai + finance). The generated `src/<id>-api/` tree posts to a proxy prefix (`/<id>-api/…`) stripped by the consumer's nginx block down to the producer's natural paths; the prefix and base URL are injected through `<id>-api-runtime-config.ts`, never hardcoded into the generated output.

### Stage 3 — runtime call

The committed `sdk.gen.ts` operations are called directly by the consumer's data layer (React Query hooks, loaders). Type safety flows end-to-end from the producer's zod schemas through the OpenAPI document to the consumer's call sites — entirely without the `pillar('<id>')` runtime proxy, which remains generically typed (`pillar<TRouter>(id)`, see [Relationship to the `pillar()` proxy](#relationship-to-the-pillar-proxy)).

## Business Rules

- **The contract is the only authored source.** `generate-openapi.ts` is a pure projection — never hand-edit the OpenAPI JSON, never hand-edit the `.gen.ts` clients. Edit the contract, regenerate, commit the diff.
- **Every artifact is committed and drift-gated.** Generated output is checked in so polyglot consumers and reviewers see the wire surface without running a build, and CI fails on any uncommitted regeneration diff.
- **Determinism is mandatory.** Sorted keys + `oxfmt` make every generator idempotent; a non-deterministic generator would make the drift gate flap.
- **Per-consumer ownership.** Each consumer owns its generated client slice; there is no shared cross-app client and no shared SDK that imports every pillar's contract.
- **Cross-pillar input never reaches into the producer's source tree.** A consumer in pillar A reading TS pillar B's OpenAPI uses B's published `@pops/<B>/openapi` export, never a sibling-folder relative path. The Rust `contacts` producer has no npm package to export, so its consumers vendor a copy of the published snapshot under their own `contracts/` dir (drift-gated by `scripts/ci/check-vendored-contracts.mjs`); either way the consumer carries nothing from the producer's source tree.
- **Rust and TS producers are interchangeable downstream.** The OpenAPI document is the contract boundary; `contacts` being axum-based is invisible to its TS consumers — they generate against a vendored copy of its snapshot exactly as they would against a TS pillar's exported spec.

## Edge Cases

| Case                                                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract changes but OpenAPI not regenerated            | CI codegen-drift gate (`generate:*` + `git diff --exit-code`) fails on the pillar unit.                                                                                                                                                                                                                                                                                        |
| OpenAPI changes but a consumer's client not regenerated | The committed `.gen.ts` is stale; the consuming app's typecheck still passes against the old client until the consumer regenerates. Closing this app-side gate is [deferred](../../../ideas/type-generation-pipeline.md).                                                                                                                                                      |
| zod 4 schema in the contract                            | Custom transformer in `generate-openapi.ts` handles it; the bundled zod-3 transformer would emit empty schemas.                                                                                                                                                                                                                                                                |
| Rust pillar (`contacts`)                                | `emit-openapi` binary writes the same JSON slot; a missing or untracked spec FAILS the Rust drift gate (asserts the file is tracked before diffing).                                                                                                                                                                                                                           |
| Consumer of the Rust `contacts` producer                | `contacts` ships no npm package, so the consumer cannot import `@pops/contacts/openapi`; it vendors a copy of the published snapshot under its own `contracts/` dir and generates against the local copy. A repo-level gate (`scripts/ci/check-vendored-contracts.mjs`) fails if the vendored copy drifts from the canonical `pillars/contacts/openapi/contacts.openapi.json`. |
| New pillar added                                        | Its `generate:openapi` is auto-run by the disk-discovered unit matrix; `fe-quality` globs `pillars/*/openapi/**` from disk, so no workflow edit is needed.                                                                                                                                                                                                                     |
| Consumer talks to two pillars                           | One `openapi-ts.*.config.ts` + `generate:*-client` script per producer; clients live in separate `src/<id>-api/` dirs.                                                                                                                                                                                                                                                         |
| Generated client counted as code duplication            | Excluded — the duplication gate ignores `**/src/*-api/**` because that boilerplate is identical across consumers by construction.                                                                                                                                                                                                                                              |

## Relationship to the `pillar()` proxy

The runtime cross-pillar SDK (`pillar('finance').wishlist.list(input)` in `@pops/pillar-sdk/client`) is a **separate** typing path from this pipeline. It is generic over a caller-supplied `pillar<TRouter>(id)` type parameter, and most REST pillars export an **opaque** router type (`FinanceRouter = unknown`, `InventoryRouter = unknown`, `FoodRouter = unknown`), so `pillar('inventory')` yields a fully opaque `PillarHandle` with no procedure-level types. The wire-typed alternative for those call sites is exactly this pipeline's generated `<id>-api` client.

The `@pops/pillar-sdk/capabilities` module ships the type machinery that _could_ bind a `<Pillar>Contract` to a typed proxy (`CallablePillar<C>`, `InputOf`/`OutputOf`, list projections — see [Capability projection types](capability-projection-types.md)), but it is **not** wired into the runtime `pillar()`. Connecting them — the `declareContracts`/`ContractFor<P>` mechanism the original spec proposed — is unbuilt; see [idea](../../../ideas/type-generation-pipeline.md) and the existing [client-surface](../../../ideas/client-surface.md) and [capability-projection-types](../../../ideas/capability-projection-types.md) ideas.

## Acceptance Criteria

- [x] Every TS pillar with a REST contract defines a `generate:openapi` script that projects its ts-rest+zod contract to a committed `pillars/<id>/openapi/<id>.openapi.json` (finance, ai, cerebrum, lists, food, registry, inventory, media).
- [x] Generator output is deterministic (sorted keys + `oxfmt`), supporting a `git diff --exit-code` drift check.
- [x] The Rust `contacts` pillar emits `pillars/contacts/openapi/contacts.openapi.json` via an `emit-openapi` binary, into the same slot TS consumers read.
- [x] Each FE consumer projects an OpenAPI document to a committed typed client under `src/<id>-api/` via `@hey-api/openapi-ts` (`@hey-api/client-fetch` + `@hey-api/typescript` + `@hey-api/sdk`).
- [x] Cross-pillar OpenAPI input is resolved through the producer's published `@pops/<id>/openapi` export, not a sibling-folder relative path (shell → registry).
- [x] Generated client base URL / proxy prefix is injected via a runtime-config module, not hardcoded into the generated output.
- [x] CI runs every unit's `generate:*` scripts and fails on any uncommitted diff (`unit-quality.yml` codegen-drift step), gating both `generate:openapi` and `generate:manifest`.
- [x] CI fails on a missing, untracked, or stale `contacts` OpenAPI spec (`rust-quality.yml` drift gate).
- [x] The generated `**/src/*-api/**` clients are excluded from the duplication gate so codegen boilerplate is not penalised.
- [ ] An app-side drift gate regenerates each consumer's `<id>-api` client and fails on a diff, so a producer OpenAPI change cannot leave a stale committed client. — deferred, see [idea](../../../ideas/type-generation-pipeline.md).
- [ ] The runtime `pillar('<id>')` proxy is bound to per-pillar contract types (no hand-written `TRouter`). — deferred; the projection machinery exists in `capabilities` but is not connected.

## Out of Scope

- A `declareContracts` / `ContractFor<P>` SDK augmentation step. The shipped pipeline is OpenAPI-projection-based, not declaration-merging-based. Binding the runtime proxy to contract types is tracked as an [idea](../../../ideas/type-generation-pipeline.md).
- A single shared cross-app generated client. Per-consumer ownership is deliberate.
- Auto-generating the consumer `openapi-ts.config.ts` files. Each consumer declares its own producers explicitly.
- Non-TypeScript consumer codegen tooling. The committed OpenAPI JSON is the polyglot contract; downstream language clients are each consumer's concern.
- The runtime manifest payload surface (search adapters, AI tool names, URI types, settings keys) — that is the Zod-validated `ManifestPayload`, owned by the registry/SDK, not this compile-time pipeline.
