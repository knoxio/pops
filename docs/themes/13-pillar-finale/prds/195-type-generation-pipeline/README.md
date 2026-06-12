# PRD-195: Type generation pipeline

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)

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

| #   | Story                                                         | Summary                                 |
| --- | ------------------------------------------------------------- | --------------------------------------- |
| 01  | [us-01-declare-helper](us-01-declare-helper.md)               | The `declareContracts` type-only helper |
| 02  | [us-02-app-pilot-integration](us-02-app-pilot-integration.md) | Wire it into pops-shell first           |
| 03  | [us-03-author-docs](us-03-author-docs.md)                     | Documentation on adding a new contract  |

## Out of Scope

- Auto-generated `declareContracts` calls.
- Cross-app type sharing.
- Codegen tooling for non-TypeScript consumers.
