# PRD-195: Type generation pipeline

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)
>
> Status: **Not started**

## Overview

The build-time pipeline that consumes each `@pops/<pillar>-contract`'s manifest type and produces the consumer-side typings used by `pillar()`. Most of this is type-level (handled by PRD-160's projections); this PRD wires the actual codegen + ensures every contract's typings flow through.

## Data Model

No persistent data. Build pipeline.

## API Surface

### Contract declaration helper

```ts
// User-defined; lives in apps that consume the SDK
import { declareContracts } from '@pops/pillar-sdk/declare';
import type { FinanceContract } from '@pops/finance-contract';
import type { MediaContract } from '@pops/media-contract';
// ...

declareContracts<{
  finance: FinanceContract;
  media: MediaContract;
  // ...one per pillar
}>();
```

A type-only call that augments the SDK's `ContractFor<P>` mapping; consumers get full typed `pillar('finance')`.

## Business Rules

- **Each app calls `declareContracts` once at the entry point.** apps/pops-shell, apps/pops-worker, etc.
- **The declaration is type-only — no runtime cost.**
- **TypeScript's declaration merging propagates the mapping** to all `pillar()` call sites.
- **Adding a new pillar = update each app's `declareContracts` call.** Could later automate via codegen, but explicit is fine for now.

## Edge Cases

| Case                                  | Behaviour                                                        |
| ------------------------------------- | ---------------------------------------------------------------- |
| App declares only a subset of pillars | `pillar('undeclared')` type-errors at the call site.             |
| Two apps declare different subsets    | Each app's compiler sees its own subset; no cross-contamination. |
| Contract type changes                 | TypeScript propagates the diff to every `pillar()` call site.    |

## User Stories

| #   | Story                                                         | Summary                                 | Status      |
| --- | ------------------------------------------------------------- | --------------------------------------- | ----------- |
| 01  | [us-01-declare-helper](us-01-declare-helper.md)               | The `declareContracts` type-only helper | Not started |
| 02  | [us-02-app-pilot-integration](us-02-app-pilot-integration.md) | Wire it into pops-shell first           | Not started |
| 03  | [us-03-author-docs](us-03-author-docs.md)                     | Documentation on adding a new contract  | Not started |

## Implementation Audit (2026-06-13)

Audit-only sweep against `packages/*-contract`, `packages/pillar-sdk`, and consuming apps. PRD-155 (manifest type generation) is referenced as the upstream codegen dependency.

| AC / Story                                      | Status      | Evidence                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-01 — `declareContracts` type-only helper     | Not started | No `declare`/`declareContracts` symbol exists in `packages/pillar-sdk/src`. No `./declare` subpath in `packages/pillar-sdk/package.json#exports`. No `ContractFor<P>` mapping or augmentable interface found.                                                                                                                              |
| US-02 — pops-shell pilot integration            | Not started | Repo-wide grep for `declareContracts` and `ContractFor` returns zero matches across `apps/*` and `packages/*`. `packages/pillar-sdk/src/contracts/index.ts` only re-exports `FinanceContract` types directly — there is no per-app declaration site.                                                                                       |
| US-03 — Author docs for adding a new contract   | Not started | No documentation in `packages/pillar-sdk` describing how to register a new pillar via `declareContracts`. Existing contract READMEs cover authoring the contract itself (PRD-155 territory), not consumer-side type wiring.                                                                                                                |
| Codegen pipeline (PRD-155 upstream dependency)  | Partial     | PRD-155's codegen (`manifest.generated.ts`, `verify:manifest`, `generate:openapi`, extractors under `scripts/contract/`) is live in `packages/finance-contract` only. Other `*-contract` packages (cerebrum, core, food, inventory, lists, media) have not yet been wired through the pipeline — PRD-195 cannot light up until they exist. |
| OpenAPI snapshot per contract                   | Partial     | `packages/finance-contract/openapi/finance.openapi.json` plus `etc/finance-contract.api.json` / `.zod.json` snapshots are produced by `pnpm build`. No equivalent snapshots in the other contract packages.                                                                                                                                |
| Declaration bundling into consumer-side typings | Not started | No bundling step takes each contract's `dist/manifest.d.ts` and surfaces it as a typed `pillar('<id>')` entry. The `pillar()` client surface itself (PRD-191) is also not started, so there is nothing to type-augment.                                                                                                                    |

**Verdict:** PRD-195 is **Not started**. The build-time codegen primitives it depends on (PRD-155) exist for finance only; the consumer-side `declareContracts` helper, the SDK augmentation point, and the pilot integration in pops-shell are all absent.

## Out of Scope

- Auto-generated `declareContracts` calls.
- Cross-app type sharing.
- Codegen tooling for non-TypeScript consumers.
