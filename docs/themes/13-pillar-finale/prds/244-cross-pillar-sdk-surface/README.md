# PRD-244: Cross-pillar SDK surface (unblock app-ai + app-finance batch 2)

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Not started** — scoping PRD. Decisive recommendation: ship Option A
> (typed proxy in a loop) for the immediate unblock; Option B / C only if pain
> materialises.

## Overview

PRD-227's consumer-migration wave moved most `app-*` packages onto the per-pillar
SDK surface. Two consumers remain blocked because they are **entirely
cross-pillar**, and the SDK affordances added in PRD-227 (the typed `pillar()`
proxy, `fetchQuery`, `usePillarQueries`, `setData` / `invalidate`,
`PillarCallError` discriminants) all assume **single-pillar** call sites:

- **`app-ai` — 0 / 14 sites migrated.** Every call is `trpc.core.ai*`-shaped.
  `app-ai` is a front-end for the cross-pillar AI surface (budgets, providers,
  usage, observability, cache) — it is not its own pillar. See
  [app-ai-consumer-inventory](../../notes/app-ai-consumer-inventory.md) (PR
  [#3146](https://github.com/knoxio/pops/pull/3146)).
- **`app-finance` batch 2 — 23 deferred sites.** The trivial pillar-local 24
  sites migrated in PRD-227's `app-finance` batch 1 (see
  [app-finance-consumer-inventory](../../notes/app-finance-consumer-inventory.md));
  the remaining 23 hit `trpc.core.{corrections,tagRules,entities}` from a
  `finance`-shaped surface and have no first-class cross-pillar SDK affordance
  today.

The SDK has no first-class "give me a typed builder that aggregates calls across
pillars" surface. Existing options are:

- **Typed proxy** — `pillar('core').<router>.<proc>(input)` works for a single
  call but offers no orchestration (parallel fan-out, tuple-typed result,
  combined error discrimination).
- **`callDynamic`** ([PR
  #3131](https://github.com/knoxio/pops/pull/3131)) — works for external
  pillars but loses end-to-end typing for known in-repo pillars. The typed
  proxy is the right tool when the target pillar is in-repo (see
  [internal-vs-external-pillar-call-sites](../../notes/internal-vs-external-pillar-call-sites.md)
  shipped by PRD-242 US-05).

PRD-244 scopes the design decision. The honest framing: this is a "do the
boring thing first" PRD. The big affordance only ships if the boring thing
hurts.

## Background

PRD-227's audit was scoped per `app-*` package and per single-pillar router.
The audit doc + the PRD-227 surface delivered:

- A typed `pillar(id)` proxy for single calls (`pillar('finance').wishlist.list(...)`).
- Hook surfaces (`usePillarQuery`, `usePillarMutation`, `usePillarQueries`,
  `useUtils()`) all keyed by **one** `pillarId`.
- `PillarCallError` discriminants ([PR
  #3170](https://github.com/knoxio/pops/pull/3170)) for typed error handling
  per pillar.
- A developer-facing note ([PR
  #3242](https://github.com/knoxio/pops/pull/3242)) explaining typed-proxy vs
  `callDynamic` — but only for the in-repo vs external split, not for the
  cross-pillar fan-out case.

What it did **not** cover: a consumer that needs to call **across pillar
boundaries** as a unit. `app-ai` is that consumer in pure form (every call
is `core.ai*`). `app-finance` batch 2 is that consumer in mixed form (some
sites pull `core.entities.list` alongside a `finance.transactions.list`
mutation in the same hook).

Neither case requires new orchestration in the SDK to function — both work
today with a `pillar('core').*` call (or two) per hook. The question is
whether the SDK should offer a higher-level "aggregate across pillars"
surface, or whether the typed proxy is enough.

## Options Considered

### Option A — Nothing new. Consumers call `pillar('core').*` directly (RECOMMENDED)

Consumers issue one `pillar('core').<router>.<proc>(input)` call per site
(or two, where the site mixes `core` + `finance`). For the React-hook sites,
`usePillarQuery('core', ['ai-usage', 'getStats'], input)` is the existing
PRD-227 surface — it just gets pointed at `core` instead of a pillar-local
namespace.

- **Pro.** Zero new SDK surface. PRD-227 is closed; no further additions to
  the type machinery. Aligns with the "case-by-case" rule from PRD-227 sign-off.
- **Pro.** Unblocks `app-ai` (14 sites) and `app-finance` batch 2 (23 sites)
  immediately. Both packages can drop `@pops/api-client` after the swap.
- **Pro.** Honest scoping — if no pain materialises, no affordance is built.
  The big affordance is the kind of thing that grows tentacles; deferring it
  until a real call site demands it is cheaper than designing speculatively.
- **Con.** Multi-call sites (e.g. `useRuleFormState.ts` reads
  `core.corrections.createOrUpdate` + `core.entities.list` in the same hook)
  re-issue two independent queries with two separate loading / error states.
  The consumer hand-rolls the `isLoading = aLoading || bLoading` aggregation.
- **Con.** No typed "combined error" — each call surfaces its own
  `PillarCallError`; the caller assembles a union by hand.
- **Con.** Cache-invalidation chains that cross routers (PR
  [#3146](https://github.com/knoxio/pops/pull/3146) audit flagged nine
  `app-finance` files using `trpc.useUtils()` to invalidate sibling queries
  across `finance` and `core`) become two `utils.invalidate()` calls instead
  of one. Minor ergonomic loss, no correctness loss.

### Option B — New `crossPillarQuery({ calls: [...] })` fan-out affordance

A new SDK surface that fans calls out in parallel across pillars and returns
a tuple of typed results:

```ts
const [usage, providers] = await crossPillarQuery({
  calls: [
    { pillarId: 'core', path: ['aiUsage', 'getStats'], input: { period: 'day' } },
    { pillarId: 'core', path: ['aiProviders', 'list'], input: undefined },
  ],
});
```

Shape rhymes with `usePillarQueries` ([PR
[#3177](https://github.com/knoxio/pops/pull/3177)) but across pillar
boundaries. Returns a typed tuple, surfaces a combined `PillarCallError`
union, and exposes a single `isLoading` / `isFetching` for the React-hook
flavour.

- **Pro.** Real ergonomic win for the cross-pillar multi-call sites
  (`useRuleFormState.ts`, `useTagRuleMutations.ts` and similar). One hook
  call replaces two, error handling is consolidated.
- **Pro.** Parallel fan-out is structural — easier to reason about than
  hand-rolled `Promise.all`.
- **Con.** New SDK surface. Type machinery is non-trivial (typed-tuple
  inference across heterogeneous `pillarId` × `path` keys). PRD-227 declared
  further SDK additions case-by-case; this is one such case but the case
  must be made by real pain, not speculation.
- **Con.** Most `app-ai` sites (10 / 14) are single-call. Only the multi-call
  sites benefit. The 14-site migration unblocks `app-ai` whether or not
  Option B exists.

### Option C — Cross-pillar pipeline (output of A feeds input of B)

A pipeline / saga-style affordance:

```ts
const result = await crossPillarPipeline()
  .step('entities', { pillarId: 'core', path: ['entities', 'list'] })
  .step('proposal', (ctx) => ({
    pillarId: 'core',
    path: ['corrections', 'analyzeCorrection'],
    input: { entityId: ctx.entities[0].id },
  }))
  .run();
```

- **Pro.** Expresses dependent cross-pillar workflows directly.
- **Con.** Substantial design and type-machinery surface. No call site in
  the deferred audits actually needs this — every site in
  `app-ai-consumer-inventory.md` and the `core.*` section of
  `app-finance-consumer-inventory.md` is an independent fan-out, not a
  dependent pipeline.
- **Con.** Tempting to build because it's interesting; expensive to maintain
  because it's a DSL. Defer unless a real call site demands it.

### Recommendation

**Option A.** It's the only option that unblocks the deferred consumers
without new SDK surface or speculative design. PRD-227's case-by-case rule
applies: Option B is justified by aggregate pain that doesn't exist yet, and
Option C is a DSL with no current consumer.

US-03 is the explicit post-mortem checkpoint: after US-01 and US-02 ship, if
the multi-call sites are demonstrably worse off, a successor PRD scopes
Option B. If they're not, the affordance never ships and that's the right
outcome.

## Surface

PRD-244 ships **no new code** in the SDK. All consumer changes use the
existing PRD-227 surface.

| Surface                                                                 | Used by                                                                                     | Status                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| `pillar('core').<router>.<proc>(input)` typed proxy                     | Node consumers in `app-ai` test utilities (if any)                                          | Existing — PRD-191 / PRD-227 |
| `usePillarQuery('core', [...], input)` / `usePillarMutation('core', …)` | Every React-hook call site in `app-ai` and the 23 deferred `app-finance` cross-pillar sites | Existing — PRD-193 / PRD-215 |
| `usePillarQueries({ queries: [{ pillarId: 'core', … }, …] })`           | Multi-call sites (where the consumer wants a single loading / error state)                  | Existing — PR #3177          |
| `PillarCallError` discriminants                                         | Error-handling branches in the migrated sites                                               | Existing — PR #3170          |
| `crossPillarQuery` / `crossPillarPipeline`                              | Out of scope. Successor PRD only if US-03 post-mortem surfaces a real need.                 | Not built                    |

After the migration, `packages/app-ai/package.json` and
`packages/app-finance/package.json` no longer list `@pops/api-client` as a
dependency (US-04). The PRD-227 retirement-of-`@pops/api-client` line item
gets one more box checked.

## Business Rules

- **No new SDK surface in PRD-244.** Every consumer change is mechanical:
  swap `trpc.core.<router>.<proc>.useQuery(input)` for
  `usePillarQuery('core', ['<router>', '<proc>'], input)` (or the mutation
  equivalent). No type machinery extensions.
- **Cross-pillar invalidation chains split into per-pillar
  `utils.invalidate()` calls.** Where an `app-finance` site today calls
  `utils.core.corrections.invalidate()` and
  `utils.finance.transactions.invalidate()` in one hook, the migrated site
  calls each on its respective pillar's `useUtils()`. No unified-cross-pillar
  utils surface is introduced.
- **Tests flip mocks from `@pops/api-client` to the SDK module name.**
  Existing per-site mocks become per-pillar SDK mocks. No dual-mock state.
- **US-03 is non-optional.** The post-mortem must be authored even if the
  conclusion is "Option A was enough, no successor PRD." A documented
  decision is the deliverable.
- **No retroactive `@pops/api-client` re-introduction.** Once US-04 removes
  the dependency from `packages/app-ai/package.json` and
  `packages/app-finance/package.json`, any future cross-pillar call uses the
  SDK surface or `callDynamic` — never `@pops/api-client`. This keeps the
  PRD-218 retirement path clean.

## Edge Cases

| Case                                                                                                                                | Behaviour                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A multi-call `app-finance` site (e.g. `useRuleFormState.ts`) reads `core.corrections.*` + `core.entities.list` in the same hook     | Two independent `usePillarQuery('core', …)` calls. The hook aggregates `isLoading` and error state by hand. Documented as the pattern in US-02; flagged as a candidate Option B pain point in US-03.                                     |
| A migrated site needs to invalidate both `core.corrections.list` and `finance.transactions.list` after a mutation                   | Two `utils.invalidate()` calls — one on `usePillarUtils('core')`, one on `usePillarUtils('finance')`. No unified surface.                                                                                                                |
| One pillar's call succeeds, the other fails                                                                                         | Each call surfaces its own `PillarCallError`. The consumer's UI either renders partial data or escalates. Same shape as any two independent `usePillarQuery` calls.                                                                      |
| `app-ai`'s cache-management page consolidation (the `useCacheManagementModel.ts` + `useCacheCardModel.ts` duplicate noted in #3146) | Out of scope for PRD-244 — the audit flagged duplication; consolidation is its own follow-up. PRD-244 migrates both files as-is. The duplication does not block the SDK swap.                                                            |
| Post-mortem (US-03) finds Option B is warranted                                                                                     | Successor PRD scopes the surface, named at the time it's filed. PRD-244 closes regardless — the work is done, the verdict is recorded.                                                                                                   |
| Post-mortem finds Option B is **not** warranted                                                                                     | PRD-244 closes with the recorded decision. Future cross-pillar consumers (if any) follow the Option A pattern. No SDK changes.                                                                                                           |
| `@pops/api-client` removal in US-04 reveals a test file or fixture still importing it                                               | The test is migrated (mocks flip to the SDK module) or removed if obsolete. The dependency drop only lands once `pnpm --filter @pops/app-ai typecheck/test/build` and `pnpm --filter @pops/app-finance typecheck/test/build` pass clean. |
| A future cross-pillar consumer outside `app-ai` / `app-finance` lands before US-03                                                  | The new consumer follows Option A. US-03's post-mortem includes it in the pain-assessment. The post-mortem is not gated on the count of sites — three migrated packages is enough signal.                                                |

## User Stories

| #   | Story                                                                         | Summary                                                                                                                                                       | Parallelisable             |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 01  | [us-01-app-ai-migration](us-01-app-ai-migration.md)                           | Migrate `app-ai`'s 14 sites to `pillar('core').*` / `usePillarQuery('core', …)`. End-to-end unblock for `app-ai`.                                             | Yes — independent of US-02 |
| 02  | [us-02-app-finance-batch-2-migration](us-02-app-finance-batch-2-migration.md) | Migrate `app-finance` batch 2's 23 cross-pillar sites (`core.{corrections,tagRules,entities}.*`) to `usePillarQuery('core', …)` and the mutation equivalents. | Yes — independent of US-01 |
| 03  | [us-03-post-mortem](us-03-post-mortem.md)                                     | Author a post-mortem after US-01 + US-02 land. Verdict: ship Option B (scope successor PRD) or close the cross-pillar question (decision recorded).           | Blocked by US-01 + US-02   |
| 04  | [us-04-drop-api-client-dependency](us-04-drop-api-client-dependency.md)       | Drop `@pops/api-client` from `packages/app-ai/package.json` and `packages/app-finance/package.json` once the migrations are clean. Update lockfile.           | Blocked by US-01 + US-02   |

US-01 and US-02 are fully independent — different packages, different
target files, different test surfaces. They can ship in parallel PRs. US-03
and US-04 only land once the two migration PRs are merged.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- All 14 `app-ai` call sites listed in
  [app-ai-consumer-inventory.md](../../notes/app-ai-consumer-inventory.md)
  use `usePillarQuery('core', …)` or `usePillarMutation('core', …)`. No
  `trpc.core.ai*` reference remains under `packages/app-ai/src/`.
- All 23 deferred `app-finance` cross-pillar sites listed in
  [app-finance-consumer-inventory.md](../../notes/app-finance-consumer-inventory.md)
  (the `trpc.core.*` table) use the SDK surface. No `trpc.core.*` reference
  remains under `packages/app-finance/src/`.
- `packages/app-ai/package.json` and `packages/app-finance/package.json` no
  longer list `@pops/api-client` as a dependency. `pnpm-lock.yaml` updated.
- A post-mortem note exists under `docs/themes/13-pillar-finale/notes/`
  recording the cross-pillar SDK decision (ship Option B or close the
  question).
- `pnpm --filter @pops/app-ai typecheck/test/build`,
  `pnpm --filter @pops/app-finance typecheck/test/build`, and the full
  monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Option B (`crossPillarQuery`) implementation.** Successor PRD only if
  US-03's post-mortem makes the case. PRD-244 explicitly does not design or
  prototype this surface.
- **Option C (`crossPillarPipeline`).** Deferred unless a real dependent
  cross-pillar workflow surfaces. None exists in the inventories.
- **Any new SDK type machinery.** PRD-227 is closed; further additions are
  case-by-case. PRD-244 ships zero SDK changes.
- **Consolidating `app-ai`'s `useCacheManagementModel.ts` /
  `useCacheCardModel.ts` duplication.** Flagged by the audit; out of scope
  here. Track separately if it becomes a problem.
- **Type-only `@pops/api/modules/**` imports.\*\* Those are PRD-227 / contract
  package territory; PRD-244 only addresses call-site swaps.
- **Migrating any consumer outside `app-ai` and `app-finance`.** Other
  packages are either already on the SDK (PRD-227 wave 4) or out of scope
  for this PRD.
- **Per-pillar SDK ai-surface packages** (e.g. a hypothetical
  `@pops/ai-sdk`). The AI surface stays on `pillar('core').ai*` because the
  AI procedures live on the `core` pillar per ADR-035. Splitting them off
  is a separate architectural question.

## References

- [app-ai-consumer-inventory](../../notes/app-ai-consumer-inventory.md) — the 14-site audit (PR [#3146](https://github.com/knoxio/pops/pull/3146))
- [app-finance-consumer-inventory](../../notes/app-finance-consumer-inventory.md) — the 23-site cross-pillar deferred set (PR [#3146](https://github.com/knoxio/pops/pull/3146))
- [PRD-227](../227-sdk-consumer-migration-audit/README.md) — SDK consumer migration audit (the parent migration programme)
- [PRD-242 US-05](../242-dynamic-approuter/us-05-developer-doc-typed-vs-calldynamic.md) + [internal-vs-external-pillar-call-sites](../../notes/internal-vs-external-pillar-call-sites.md) — the typed-proxy vs `callDynamic` split (in-repo vs external)
- PR [#3131](https://github.com/knoxio/pops/pull/3131) — `callDynamic` escape hatch
- PR [#3170](https://github.com/knoxio/pops/pull/3170) — typed `PillarCallError` discriminants
- PR [#3177](https://github.com/knoxio/pops/pull/3177) — `usePillarQueries` (single-pillar fan-out — the shape Option B would rhyme with)
- PR [#3242](https://github.com/knoxio/pops/pull/3242) — typed-proxy vs `callDynamic` developer doc
- [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition; AI surface lives on `core`
- `packages/pillar-sdk/src/client/proxy.ts:26-72` — `CallDynamicFn` definition (cross-references for the post-mortem)
