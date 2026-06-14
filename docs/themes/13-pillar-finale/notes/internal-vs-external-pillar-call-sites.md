# Consumer call sites — in-repo pillars vs external pillars

Two consumer-side surfaces exist on `@pops/pillar-sdk`. Pick by where the pillar lives.

| Pillar lives in                                                                                                                  | Surface                                                                               | Typesafety                                                                                                                                                               | Example                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| This monorepo (`packages/<id>-contract`, `apps/pops-<id>-api`)                                                                   | Typed proxy: `pillar('<id>').<router>.<proc>(input)`                                  | Full end-to-end — input + output types come from the codegen-derived `AppRouter` (PRD-242 US-01).                                                                        | `await pillar<FinanceRouter>('finance').wishlist.list({ limit: 10 })`         |
| Another repo, registered at runtime via [PRD-228](../prds/228-dynamic-pillar-registration/README.md)'s `/core.registry.register` | Runtime escape hatch: `pillar('<id>').callDynamic(routerName, procName, input, kind)` | Input/output are `unknown` at the SDK seam. Caller declares the shape with generics at the call site; orchestrator routes at runtime via `mergeRouters` (PRD-242 US-02). | `await pillar('externalThing').callDynamic('widgets', 'list', { limit: 10 })` |

## Why two surfaces

TypeScript cannot know an out-of-repo pillar's procedure shape at compile time without a generated SDK package per external pillar. PRD-242 deliberately stops short of that step — the codegen catalogue at `apps/pops-api/src/generated/router-catalogue.ts` only sees in-repo `packages/*-contract` workspaces. External pillars are reachable at runtime via the orchestrator's `mergeRouters` pass but typed as `CallResult<unknown>` on the consumer.

The runtime routes for both surfaces are identical: `<baseUrl>/trpc/<pillarId>.<routerName>.<procName>`. The split is purely a compile-time typing decision.

## In-repo pillar — typed proxy

```ts
import { pillar } from '@pops/pillar-sdk';
import { isOk } from '@pops/pillar-sdk/errors';
import type { FinanceRouter } from '@pops/finance-contract';

const finance = pillar<FinanceRouter>('finance');
const result = await finance.wishlist.list({ limit: 10 });

if (isOk(result)) {
  for (const wish of result.value) {
    console.log(wish.id);
  }
}
```

Source: `packages/pillar-sdk/src/client/__tests__/factory.test.ts:60-68`.

Runtime flow: discovery → `<baseUrl>/trpc/finance.wishlist.list` → in-repo `financeRouter` (statically imported via the codegen catalogue) → typed `CallResult<{ id: string }[]>`.

## External pillar — `callDynamic`

```ts
import { pillar } from '@pops/pillar-sdk';
import { isOk } from '@pops/pillar-sdk/errors';

const externalThing = pillar('externalThing');
const result = await externalThing.callDynamic('widgets', 'list', { limit: 10 });

if (isOk(result)) {
  const widgets = result.value as readonly { id: string }[];
  for (const widget of widgets) {
    console.log(widget.id);
  }
}
```

Source: `packages/pillar-sdk/src/client/__tests__/call-dynamic.test.ts:45-54`.

Runtime flow: discovery → `<baseUrl>/trpc/externalThing.widgets.list` → orchestrator's runtime `mergeRouters` output → external pillar's `-api` container → `CallResult<unknown>`. The orchestrator subscribes to PRD-228 `registered` / `deregistered` events and recomposes its merged router on each (debounced 250ms to match the nginx-regen contract).

`kind` defaults to `'query'`; pass `'mutation'` for writes so React Query can route the call through the mutation hook surface.

## Migration

No call-site migration. Existing in-repo consumers stay on the typed proxy; PRD-242 deletes the hand-curated `KNOWN_ROUTERS` literal but the consumer-facing `pillar('<id>').<router>.<proc>` shape is unchanged. `callDynamic` is opt-in and exists solely for pillars whose routers cannot be reached at compile time.

## Cross-references

- [PRD-228](../prds/228-dynamic-pillar-registration/README.md) — runtime registration / heartbeat / deregister surface for external pillars.
- [PRD-233](../prds/233-external-pillar-example-repo/README.md) — Rust external-pillar example that exercises the loop end-to-end.
- [PRD-242](../prds/242-dynamic-approuter/README.md) — dynamic `AppRouter` composition: codegen catalogue + runtime `mergeRouters`. US-01 (#3232), US-02 (#3239), US-03 (#3240), US-04 (e2e callDynamic test).
- [ADR-026](../../../architecture/adr-026-pillar-architecture.md) — original pillar definition; per-`-api` container end state.
- [ADR-035](../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition: external pillars are first-class.
- PR [#3131](https://github.com/knoxio/pops/pull/3131) — shipped `pillar(id).callDynamic`; see `packages/pillar-sdk/src/client/proxy.ts:26-72` (`CallDynamicFn`).
- Pillar isolation audit — [H3](pillar-isolation-audit.md#h3---appspops-apisrcrouterts-hand-curates-every-pillars-trpc-router): the finding PRD-242 closes.
