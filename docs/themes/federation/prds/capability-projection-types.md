# Capability projection types

> Theme: [Federation](../README.md)

## Overview

Type-level transforms in `@pops/pillar-sdk/capabilities` (`libs/sdk/src/capabilities`) that take a contract type satisfying `BaseContract` and project the derived shapes downstream tooling needs: router subtrees, entity/schema/error maps, list-to-union projections (search adapters, URI types, settings keys, AI tool names), per-procedure input/output/kind extraction, call signatures, the cross-pillar `CallResult<T>` discriminant, and the `CallablePillar<C>` proxy shape.

Pure type machinery. The module is type-only except for three runtime exports: `PillarCallError` (the error class `.orThrow()` throws), `PILLARS` (the curated readonly array of in-tree pillar ids), and `isKnownPillarId` (the runtime narrowing guard against that array). Everything else is erased at runtime.

The module is published as the `./capabilities` subpath of `@pops/pillar-sdk` and is also re-exported from the package root. It is consumed for its **runtime** exports (`PILLARS`, `isKnownPillarId`, `PillarCallError`) by build-time surfaces such as the nginx render-order coverage assert. The **type** projections are a standalone, fully-tested toolkit; the runtime `pillar()` consumer SDK in `@pops/pillar-sdk/client` ships its own parallel proxy machinery and does not import these projections (see [Relationship to the runtime `pillar()` SDK](#relationship-to-the-runtime-pillar-sdk)).

## Data Model

### `BaseContract` and `ProcedureShape`

The type bound every projection accepts. A contract is never asked to `extends`/`implements` this — TypeScript has no nominal conformance for type aliases. Conformance is implicit: pass a type that does not structurally satisfy `BaseContract` to any projection and it type-errors at the call site.

```ts
// libs/sdk/src/capabilities/base-contract.ts
export interface BaseContract {
  readonly pillar: string;
  readonly version: string;
  readonly types: Record<string, unknown>;
  readonly schemas: Record<string, unknown>;
  readonly router: Record<string, Record<string, ProcedureShape>>; // <router>.<proc>
  readonly errors: Record<string, unknown>;
  readonly search: { readonly adapters: readonly string[] };
  readonly ai: {
    readonly tools: readonly {
      readonly name: string;
      readonly description: string;
      readonly parameters: object;
    }[];
  };
  readonly uri: { readonly types: readonly string[] };
  readonly settings: { readonly keys: readonly string[] };
}

export interface ProcedureShape {
  readonly _def: {
    readonly inputs: readonly unknown[];
    readonly output: unknown;
    readonly kind: 'query' | 'mutation' | 'subscription';
  };
}
```

`_def.inputs` is an array because it mirrors tRPC's chainable `.input(A).input(B)` form. `_def.kind` discriminates queries, mutations, and subscriptions; only `query` and `mutation` are projected today — subscription typing lands with the wire transport.

### Barrel projections

Lift a named sub-object of a contract into its own alias. Pure indexed access.

```ts
// libs/sdk/src/capabilities/extraction.ts
export type RoutesOf<C extends BaseContract> = C['router'];
export type EntitiesOf<C extends BaseContract> = C['types'];
export type SchemasOf<C extends BaseContract> = C['schemas'];
export type ErrorsOf<C extends BaseContract> = C['errors'];
```

### List-to-union projections

Collapse a `readonly string[]` (or, for AI tools, a `readonly { name; ... }[]`) into a string union for autocomplete + typo detection. An empty list projects to `never`.

```ts
// libs/sdk/src/capabilities/list-projections.ts
export type SearchAdaptersOf<C extends BaseContract> = C['search']['adapters'][number];
export type UriTypesOf<C extends BaseContract> = C['uri']['types'][number];
export type SettingsKeysOf<C extends BaseContract> = C['settings']['keys'][number];
export type AiToolNamesOf<C extends BaseContract> = C['ai']['tools'][number]['name'];
```

### Procedure projections

```ts
// libs/sdk/src/capabilities/procedure.ts
export type InputOf<P extends ProcedureShape> = P['_def']['inputs'] extends readonly [
  infer First,
  ...unknown[],
]
  ? First
  : void;
export type OutputOf<P extends ProcedureShape> = P['_def']['output'];
export type KindOf<P extends ProcedureShape> = P['_def']['kind'];
```

`InputOf` picks `inputs[0]` — the consumer-facing single-arg shape; multi-input chaining is a tRPC implementation detail. A procedure with **no** declared input projects to `void`, and the derived call signatures make the argument optional.

### Call result discriminant

Every cross-pillar call resolves to one of these. Failure modes are universal, not per-procedure: a generic caller gets exactly the metadata it needs to react.

```ts
// libs/sdk/src/capabilities/call-result.ts
export type CallResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly pillar: string }
  | { readonly kind: 'degraded'; readonly reason: string }
  | { readonly kind: 'contract-mismatch'; readonly expected: string; readonly actual: string }
  | {
      readonly kind: 'validation-error';
      readonly issues: readonly { readonly field: string; readonly reason: string }[];
    };

export type CallResultKind = Exclude<CallResult<unknown>, { kind: 'ok' }>['kind'];
```

### Call signatures

```ts
// libs/sdk/src/capabilities/procedure.ts
type CallArgs<P extends ProcedureShape> =
  InputOf<P> extends void ? [input?: void] : [input: InputOf<P>];

export type CallSignature<P extends ProcedureShape> = (
  ...args: CallArgs<P>
) => Promise<CallResult<OutputOf<P>>>;

export type CallSignatureOrThrow<P extends ProcedureShape> = (
  ...args: CallArgs<P>
) => Promise<OutputOf<P>>;
```

`CallSignatureOrThrow` is the happy-path opt-out: it lifts an `ok` value and throws everything else as `PillarCallError`. It is attached per-procedure as `.orThrow`, not at the pillar level — opt-in is explicit and visible at the call site.

### `CallablePillar<C>` — the proxy shape

```ts
// libs/sdk/src/capabilities/callable-pillar.ts
export type CallablePillar<C extends BaseContract> = {
  readonly [Router in keyof C['router']]: {
    readonly [Procedure in keyof C['router'][Router]]: CallSignature<
      C['router'][Router][Procedure]
    > & {
      readonly orThrow: CallSignatureOrThrow<C['router'][Router][Procedure]>;
    };
  };
};
```

Each router becomes an object; each procedure a callable returning `Promise<CallResult<Output>>` with `.orThrow` attached.

### `PillarCallError`

```ts
// libs/sdk/src/capabilities/call-result.ts
export class PillarCallError extends Error {
  override readonly cause: Exclude<CallResult<unknown>, { kind: 'ok' }>;
  constructor(cause: Exclude<CallResult<unknown>, { kind: 'ok' }>) { ... }
}
```

Carries the original failure `CallResult` on `.cause`, and formats a human-readable message per discriminant (e.g. `Pillar call failed: pillar 'finance' unavailable`, `… validation-error (2 issues)` with correct singular/plural).

### Pillar and module ids

The federation refactor (RD-9) collapsed the formerly-closed compile-time pillar tier. `KnownPillarId`, `PillarId`, and `ModuleId` are all aliases of the open `string`; the registry is the sole source of truth for which pillars exist, so adding `pillars/<new>/` (or registering one at runtime over the LAN) needs no type edit.

```ts
// libs/sdk/src/capabilities/known-pillar-id.ts
export const PILLARS = [
  'registry',
  'finance',
  'media',
  'inventory',
  'cerebrum',
  'food',
  'lists',
  'contacts',
  'ai',
] as const;

export type PillarId = string;
export type KnownPillarId = PillarId; // alias kept for self-describing call sites
```

```ts
// libs/sdk/src/capabilities/module-id.ts
export type ModuleId = PillarId;
export function isKnownPillarId(id: string): id is KnownPillarId {
  return (PILLARS as readonly string[]).includes(id);
}
```

`PILLARS` is a **value**, not the source of a closed type — the curated "pillars baked into this build" list. `isKnownPillarId` is the runtime seam that distinguishes that curated set from an arbitrary registry id; it is the correct gate for build-time surfaces (nginx upstream map, render-order coverage assert) that must enumerate in-tree pillars. `registry` is the platform registry/discovery/settings host (formerly `core`).

## API Surface

### `@pops/pillar-sdk/capabilities`

```ts
export type {
  BaseContract,
  ProcedureShape,
  RoutesOf,
  EntitiesOf,
  SchemasOf,
  ErrorsOf,
  SearchAdaptersOf,
  UriTypesOf,
  SettingsKeysOf,
  AiToolNamesOf,
  InputOf,
  OutputOf,
  KindOf,
  CallSignature,
  CallSignatureOrThrow,
  CallResult,
  CallResultKind,
  CallablePillar,
  KnownPillarId,
  PillarId,
  ModuleId,
};
export { PillarCallError, PILLARS, isKnownPillarId }; // runtime
```

Also re-exported from the package root (`@pops/pillar-sdk`).

### Usage

```ts
import type { CallablePillar, SettingsKeysOf, UriTypesOf } from '@pops/pillar-sdk/capabilities';

type Callable = CallablePillar<MyContract>;
// → { wishlist: { list: (input) => Promise<CallResult<Wishlist[]>> & { orThrow }, ... }, ... }

type Settings = SettingsKeysOf<MyContract>; // 'finance.defaultBudgetPeriod' | 'finance.tagSeparator'
type Uris = UriTypesOf<MyContract>; // 'finance/wishlist-item' | 'finance/budget'

const r = await callable.wishlist.list({});
if (r.kind === 'ok') console.log(r.value); // r.value typed; non-ok branches forced
const items = await callable.wishlist.list({}).orThrow(); // throws PillarCallError on non-ok
```

## Relationship to the runtime `pillar()` SDK

The consumer-facing runtime `pillar('finance').wishlist.list(input)` API ships in `@pops/pillar-sdk/client` (`libs/sdk/src/client`), **not** here. That layer derives its proxy shape (`PillarHandle<TRouter>`, `CallableProcedure`) directly from a router type parameter and carries its own, richer `CallResult` / `CallFailure` (adding `conflict`, `bad-request`, `unauthorized`, `pillar`-tagged discriminants) plus a `callDynamic` runtime escape hatch and a distinct `PillarCallError(pillarId, result)` constructor.

The two layers are **parallel, not composed**: `client` does not import from `capabilities`, and `capabilities` has no downstream consumers of its type projections. This duplication is a known divergence — the projection toolkit was built contract-first; the runtime SDK was built router-type-first against REST pillars whose router types are largely opaque (`FinanceRouter = unknown` etc., because REST pillars expose OpenAPI, not a concrete tRPC router). Reconciling the two `CallResult` shapes and wiring `client` to derive its proxy from `CallablePillar` is captured as future work in [docs/ideas/capability-projection-types.md](../../../ideas/capability-projection-types.md).

## Business Rules

- **Type-only except for three runtime exports** — `PillarCallError`, `PILLARS`, `isKnownPillarId`. No runtime introspection of types; types are erased.
- **`BaseContract` is implicit, structural** — a contract that does not satisfy it type-errors at the consumer's projection site, not at the contract's own definition.
- **Failure modes are universal** — every projected procedure returns the same `CallResult<T>`; domain errors travel via `degraded.reason` or the contract's `errors` projection. (The runtime `client` layer extends this set; see above.)
- **`.orThrow` is per-procedure** — explicit opt-in, visible at the call site; `PillarCallError.cause` carries the failure result for post-catch inspection.
- **`CallResult` discriminant is `kind`** — consumers narrow on `kind === 'ok'` to reach `.value`; reading `.value` without narrowing is a type error.
- **Pillar/module id tiers are open `string`** — `KnownPillarId` / `PillarId` / `ModuleId` are all `string`; the registry is the source of truth. `isKnownPillarId` + the `PILLARS` value are the runtime curated-set seam, used only where build-time surfaces must enumerate in-tree pillars.
- **Empty lists project to `never`; empty routers project to `{}`** — the type system then statically refuses any value, which is correct.

## Edge Cases

| Case                                                                  | Behaviour                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract doesn't structurally satisfy `BaseContract`                  | Type error at the consumer's projection site.                                                                                                  |
| Empty router (no procedures)                                          | `CallablePillar<C>` is `{}`; calling anything type-errors. `EntitiesOf<C>` etc. still inspectable.                                             |
| Procedure has multiple inputs (`.input(A).input(B)`)                  | `InputOf<P>` returns the first input only.                                                                                                     |
| Procedure has no input                                                | `InputOf<P>` is `void`; the call signature accepts an optional/omitted argument.                                                               |
| Empty settings / AI-tools / adapters / uri list                       | The projected union is `never`.                                                                                                                |
| Two contracts share a procedure name (`a.users.list`, `b.users.list`) | Each contract projects independently; no cross-contract collision.                                                                             |
| Procedure output is itself a union (`Movie \| Show`)                  | `OutputOf<P>` returns the union; `CallResult<Movie \| Show>` works.                                                                            |
| `.orThrow()` on a non-ok result                                       | Throws `PillarCallError` with `.cause = result`; catch inspects `.cause.issues` etc.                                                           |
| Reading `result.value` without narrowing on `kind === 'ok'`           | Type error: property does not exist.                                                                                                           |
| Pillar/module id the build has never compiled against                 | Valid `KnownPillarId` / `ModuleId` at the type level (open `string`); `isKnownPillarId` returns `false` at runtime (not in curated `PILLARS`). |

## Acceptance Criteria

- [x] `@pops/pillar-sdk/capabilities` subpath export exists and is re-exported from the package root.
- [x] `BaseContract` + `ProcedureShape` interfaces defined; a synthetic contract structurally satisfies `BaseContract` and each of its procedures satisfies `ProcedureShape` (`projections.test.ts`).
- [x] Barrel projections `RoutesOf` / `EntitiesOf` / `SchemasOf` / `ErrorsOf` lift the correct subtree (type tests pass).
- [x] List-to-union projections `SearchAdaptersOf` / `UriTypesOf` / `SettingsKeysOf` / `AiToolNamesOf` collapse to the expected unions, and to `never` for empty lists.
- [x] Procedure projections `InputOf` (first input) / `OutputOf` / `KindOf` produce the expected types; `KindOf` distinguishes query from mutation.
- [x] `CallSignature` returns `Promise<CallResult<Output>>`; `CallSignatureOrThrow` returns `Promise<Output>`.
- [x] `CallablePillar<C>` mirrors the router tree, attaches `.orThrow` per procedure, and projects an empty contract to an empty callable.
- [x] `CallResult<T>` is a discriminated union narrowing to `.value` only on `kind === 'ok'`; each non-ok kind carries its metadata.
- [x] `PillarCallError` is throwable/catchable as an `Error`, carries `.cause`, and formats a per-discriminant message (incl. singular/plural for validation issues) — `call-result.test.ts`.
- [x] `PILLARS` is the canonical readonly tuple of in-tree pillar ids; every id is unique and kebab-case.
- [x] `isKnownPillarId` narrows an arbitrary string to `KnownPillarId` by membership of the curated `PILLARS` value, rejecting non-curated ids (`modules.test.ts`).
- [x] `KnownPillarId` / `PillarId` / `ModuleId` resolve to open `string`; a new pillar/module id is assignable with no type edit (RD-9).

## Out of Scope

- Per-procedure custom failure modes. Universal `CallResult` only; per-procedure error typing is future evolution.
- Type-level validation of router shape (e.g. "every router must have a `list`"). The contract author's responsibility.
- Runtime introspection of types. Zero runtime metadata; manifests are the runtime story.
- React-specific projections (`useQuery<P>`, `useMutation<P>`). React Query lives in `@pops/pillar-sdk/react`.
- Cross-pillar joined types. Consumers compose at the call site.
- Code generation / `.d.ts` emission.
- Streaming / subscription typing — added when the wire transport lands.
- Cross-contract analysis. Each contract is projected independently.
