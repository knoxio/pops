# PRD-160: Capability projection types

> Epic: [Pillar SDK](../../epics/01-pillar-sdk.md)

## Overview

Type-level transforms in `@pops/pillar-sdk/capabilities` that take a `<Pillar>Contract` (from PRD-155) and project derived types: callable procedure shapes, entity types, settings key unions, URI type unions, AI tool names. These projections are the foundation for the `pillar()` SDK in Epic 05 (PRD-191) and for downstream tooling like cross-pillar URI dispatch (Epic 02) and the search registry (Epic 06).

Pure type utilities — no runtime code beyond a couple of constants used by the discriminant. Lives in the SDK because the transforms are generic (one set of utilities, every contract benefits); the per-pillar contract types stay in their own packages.

The unified `pillar('finance').wishlist.list({...})` API in PRD-191 is the _consumer-facing_ shape; PRD-160 is the type machinery that makes it possible.

## Data Model

### Core projections

```ts
// @pops/pillar-sdk/capabilities

import type { ManifestPayload } from '../manifest-schema';

/**
 * Minimal shape every contract must satisfy. Authored in PRD-155.
 */
export type BaseContract = {
  pillar: string;
  version: string;
  types: Record<string, unknown>;
  schemas: Record<string, unknown>;
  router: Record<string, Record<string, ProcedureShape>>; // <router>.<proc>
  errors: Record<string, unknown>;
  search: { adapters: readonly string[] };
  ai: { tools: readonly { name: string; description: string; parameters: object }[] };
  uri: { types: readonly string[] };
  settings: { keys: readonly string[] };
};

/**
 * tRPC-shaped procedure: input + output (queries) or input + output (mutations).
 * The contract's router type (extracted in PRD-153 us-03) conforms to this.
 */
export type ProcedureShape = {
  _def: {
    inputs: readonly unknown[];
    output: unknown;
    kind: 'query' | 'mutation' | 'subscription';
  };
};

export type RoutesOf<C extends BaseContract> = C['router'];
export type EntitiesOf<C extends BaseContract> = C['types'];
export type SchemasOf<C extends BaseContract> = C['schemas'];
export type ErrorsOf<C extends BaseContract> = C['errors'];

export type SearchAdaptersOf<C extends BaseContract> = C['search']['adapters'][number];
export type UriTypesOf<C extends BaseContract> = C['uri']['types'][number];
export type SettingsKeysOf<C extends BaseContract> = C['settings']['keys'][number];
export type AiToolNamesOf<C extends BaseContract> = C['ai']['tools'][number]['name'];
```

### Procedure input/output extraction

```ts
export type InputOf<P extends ProcedureShape> = P['_def']['inputs'][0];
export type OutputOf<P extends ProcedureShape> = P['_def']['output'];
export type KindOf<P extends ProcedureShape> = P['_def']['kind'];
```

### Call result discriminant

```ts
/**
 * Every cross-pillar call returns one of these. Universal across all
 * procedures — pillars do not author per-procedure failure modes for now.
 * Universal failure modes keep the consumer code uniform across pillars.
 */
export type CallResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'unavailable'; pillar: string }
  | { kind: 'degraded'; reason: string }
  | { kind: 'contract-mismatch'; expected: string; actual: string }
  | { kind: 'validation-error'; issues: readonly { field: string; reason: string }[] };
```

### Call signature

```ts
export type CallSignature<P extends ProcedureShape> = (
  input: InputOf<P>
) => Promise<CallResult<OutputOf<P>>>;
```

### Throw variant (ergonomics)

A consumer that wants happy-path code can opt out of discriminant handling:

```ts
export type CallSignatureOrThrow<P extends ProcedureShape> = (
  input: InputOf<P>
) => Promise<OutputOf<P>>;
```

`.orThrow()` is a helper attached to every callable; it lifts an `ok` result and throws everything else as `PillarCallError`.

### `CallablePillar<C>` — the proxy shape

```ts
/**
 * The shape that `pillar('finance')` returns. Each router becomes an object;
 * each procedure becomes a callable that returns CallResult.
 *
 * `.orThrow` is attached per-procedure for ergonomic call sites.
 */
export type CallablePillar<C extends BaseContract> = {
  [Router in keyof C['router']]: {
    [Procedure in keyof C['router'][Router]]: CallSignature<C['router'][Router][Procedure]> & {
      orThrow: CallSignatureOrThrow<C['router'][Router][Procedure]>;
    };
  };
};
```

### Pillar id union

```ts
import { PILLARS } from '../pillars'; // canonical list from PRD-156

export type KnownPillarId = (typeof PILLARS)[number];
```

`pillar()` in PRD-191 will accept `KnownPillarId`, not `string`. A typo in the pillar name → type error at compile time.

## API Surface

### Exports

```ts
// @pops/pillar-sdk/capabilities/index.ts
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
  CallResult,
  CallSignature,
  CallSignatureOrThrow,
  CallablePillar,
  KnownPillarId,
};

export { PillarCallError }; // class, has runtime
```

### Usage examples (downstream)

```ts
// Inside Epic 05's pillar() SDK (PRD-191)
import type { FinanceContract } from '@pops/finance-contract';
import type { CallablePillar } from '@pops/pillar-sdk/capabilities';

type FinanceCallable = CallablePillar<FinanceContract>;
// → { wishlist: { list: (input: ListInput) => Promise<CallResult<Wishlist[]>> & { orThrow: ... }, ... }, ... }

const finance = pillar('finance'); // typed as FinanceCallable
const result = await finance.wishlist.list({});
if (result.kind === 'ok') {
  console.log(result.value); // typed as Wishlist[]
}
const items = await finance.wishlist.list({}).orThrow(); // throws on non-ok, returns Wishlist[]
```

### Settings keys

```ts
import type { FinanceContract } from '@pops/finance-contract';
import type { SettingsKeysOf } from '@pops/pillar-sdk/capabilities';

type FinanceSettings = SettingsKeysOf<FinanceContract>;
// → 'finance.defaultBudgetPeriod' | 'finance.tagSeparator'

function getSetting(key: FinanceSettings): string; // typo in key → compile error
```

### URI types

```ts
import type { UriTypesOf } from '@pops/pillar-sdk/capabilities';

type FinanceUris = UriTypesOf<FinanceContract>;
// → 'finance/transaction' | 'finance/budget' | 'finance/wish-list' | 'finance/entity'
```

## Business Rules

- **All projections are type-only.** No runtime exports beyond `PillarCallError` (one error class) and `PILLARS` (one canonical readonly array, re-exported from PRD-156's pillar list).
- **`BaseContract` is the type contract every concrete contract satisfies.** The contract package (PRD-155's generated `<Pillar>Contract`) must structurally conform; if it doesn't, the projections type-error at the consumer site.
- **Failure modes are universal, not per-procedure.** Every procedure returns a `CallResult<T>` with the same discriminants. Custom domain errors (e.g. `'budget-exceeded'`) come through `degraded` with a `reason` string or are surfaced via the `errors` projection for consumers to assert on after `kind === 'degraded'`.
- **Throw variant (`.orThrow`) is attached per-procedure, not at the pillar level.** Per-procedure for explicit opt-in; calling `.orThrow()` makes the failure mode visible at the call site.
- **`KnownPillarId` is derived from the canonical `PILLARS` list (PRD-156).** Adding a new pillar = add a string to that list → all consumer types update at compile time.
- **No runtime introspection of types.** TypeScript types are erased at runtime; PRD-160 doesn't ship runtime metadata about procedures. Runtime metadata is the manifest payload's job.
- **Generics are exhaustive.** Every projection takes the contract as a type parameter; nothing assumes a specific contract.
- **`CallResult` is a discriminated union with `kind` as the discriminant.** Consumers use `result.kind === 'ok'` for narrowing. The other kinds carry the metadata needed to react (`pillar` for unavailable, `reason` for degraded, etc.).
- **`PillarCallError` is the runtime error thrown by `.orThrow()`.** Carries the `CallResult` as `.cause` for consumers that want to inspect after catching.

## Edge Cases

| Case                                                                                                | Behaviour                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract doesn't structurally satisfy `BaseContract`                                                | Type error at the consumer's `CallablePillar<MyContract>` site. Author of the contract package fixes it.                                                                                      |
| Contract advertises an empty router (no procedures)                                                 | `CallablePillar<C>` is `{}`. Calling anything on it type-errors. Consumers can still inspect `EntitiesOf<C>`, etc.                                                                            |
| Procedure has multiple inputs (tRPC's `.input(A).input(B)`)                                         | `InputOf<P>` returns the first input only (consumer-facing single arg). Multi-input chaining is a tRPC implementation detail; the contract surface should expose a single merged input shape. |
| Settings key list is empty                                                                          | `SettingsKeysOf<C>` is `never`. Type system enforces "no settings keys exist."                                                                                                                |
| AI tools list is empty                                                                              | `AiToolNamesOf<C>` is `never`. Consumer can't reference any tool name; that's correct.                                                                                                        |
| Two contracts have a procedure with the same name (e.g. `core.users.list` and `finance.users.list`) | Each contract is projected independently; no cross-contract collision possible.                                                                                                               |
| Procedure's output type is a discriminated union itself (e.g. `Movie \| Show`)                      | `OutputOf<P>` returns the union; `CallResult<Movie \| Show>` works fine.                                                                                                                      |
| `.orThrow()` is called and the result is `{ kind: 'validation-error' }`                             | Throws `PillarCallError`, with `.cause = result`. Consumer's catch block can inspect `.cause.issues`.                                                                                         |
| Consumer uses `result.value` without narrowing on `kind === 'ok'`                                   | TypeScript error: "Property 'value' does not exist on type ...". The discriminant forces explicit narrowing.                                                                                  |
| Pillar name passed to `pillar()` isn't in `KnownPillarId` (e.g. typo `'finanze'`)                   | Type error at the call site. Compile fails.                                                                                                                                                   |
| New pillar added to `PILLARS` but no contract published                                             | `KnownPillarId` includes the name, but `CallablePillar` doesn't exist for it. `pillar('newpillar')` type-resolves but at runtime returns the `unavailable` result.                            |
| Contract type has private/internal exports                                                          | Type-level projections include them. Privacy is enforced by the contract author choosing what to put in the barrel exports (PRD-153).                                                         |

## User Stories

| #   | Story                                                               | Summary                                                                                                     | Parallelisable                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 01  | [us-01-base-contract-shape](us-01-base-contract-shape.md)           | Define `BaseContract` + `ProcedureShape` interfaces; structural-contract-conformance tests                  | yes — independent                |
| 02  | [us-02-extraction-projections](us-02-extraction-projections.md)     | `RoutesOf`, `EntitiesOf`, `SchemasOf`, `ErrorsOf` — the simple barrel projections                           | blocked by us-01                 |
| 03  | [us-03-list-projections](us-03-list-projections.md)                 | `SearchAdaptersOf`, `UriTypesOf`, `SettingsKeysOf`, `AiToolNamesOf` — list-to-union projections             | blocked by us-01                 |
| 04  | [us-04-procedure-projections](us-04-procedure-projections.md)       | `InputOf`, `OutputOf`, `KindOf`, `CallSignature`, `CallSignatureOrThrow`                                    | blocked by us-01                 |
| 05  | [us-05-call-result-discriminant](us-05-call-result-discriminant.md) | `CallResult<T>` discriminated union; `PillarCallError` class                                                | yes — independent                |
| 06  | [us-06-callable-pillar](us-06-callable-pillar.md)                   | `CallablePillar<C>` — the proxy shape used by `pillar()`                                                    | blocked by us-04 + us-05         |
| 07  | [us-07-known-pillar-id](us-07-known-pillar-id.md)                   | `KnownPillarId` derived from `PILLARS`; re-export the runtime constant                                      | blocked by PRD-156 us-01         |
| 08  | [us-08-type-tests](us-08-type-tests.md)                             | `expectTypeOf` assertions against a synthetic contract: every projection produces the expected type         | blocked by us-02..07             |
| 09  | [us-09-finance-projection-pilot](us-09-finance-projection-pilot.md) | Demonstrate `CallablePillar<FinanceContract>` against the real finance contract; usable in a stub call site | blocked by us-06 + PRD-155 us-06 |
| 10  | [us-10-author-docs](us-10-author-docs.md)                           | Documentation: how to consume the projections at a call site (PRD-191's caller-facing guide)                | yes — independent                |

## Out of Scope

- Per-procedure custom failure modes. Universal `CallResult` for now; per-procedure error advertising is a future evolution if real domain errors need first-class typing.
- Type-level validation of router shape (e.g. "every router must have a `list` procedure"). The contract author's responsibility; the projections accept whatever the contract advertises.
- Runtime introspection. TypeScript erases types; PRD-160 ships zero runtime metadata. Manifests are the runtime story.
- React-specific projections (`useQuery<P>`, `useMutation<P>`). React Query integration is Epic 05's PRD-193.
- Cross-pillar joined types (e.g. `Transaction & { entity: Entity }`). Consumers compose at the call site; contracts don't pre-join.
- Code generation. Projections are pure type system; no `.d.ts` emission, no codegen.
- Streaming / subscription typing. `subscriptions` field in the manifest is reserved; capability projection types for it are added when the wire transport lands.
- Variance / contravariance fine-tuning. TypeScript's defaults are accepted.
- Cross-contract analysis (e.g. "find all contracts that advertise a `Transaction` entity"). The contract is the consumer's choice; the SDK doesn't introspect across contracts.
