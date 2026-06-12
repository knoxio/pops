# PRD-188: Batching invariants

> Epic: [Batching fix](../../epics/04-batching-fix.md)

## Overview

Document the invariants that hold after PRD-187 lands, capture them as runtime assertions, and add CI checks to prevent regressions. The point: future code should not introduce cross-pillar batched calls accidentally.

## Data Model

No data. Invariants + tests.

## API Surface

### Invariants

1. **Every tRPC batch URL contains procedures from exactly one pillar.**
2. **Procedure paths follow `<pillar>.<router>.<procedure>` shape (already enforced by manifest schema, PRD-157).**
3. **The shell's tRPC client never constructs a batch that crosses pillar boundaries.**
4. **No legacy `/trpc?batch=...` URL contains multiple pillar prefixes.**

### Runtime assertion (dev mode)

```ts
// apps/pops-shell/src/lib/trpc.ts (dev-only)
if (process.env.NODE_ENV !== 'production') {
  trpc.subscribeToOperations((op) => {
    const namespace = op.path.split('.')[0];
    // ... assert namespace is consistent within the current batch
  });
}
```

### CI check

A test that exercises every page's data loader, captures tRPC calls, and asserts each batch URL contains one namespace prefix only.

## Business Rules

- Runtime assertions log warnings in dev; do not crash.
- CI assertions are hard failures.
- The invariant set is documented in `apps/pops-shell/src/lib/trpc.invariants.md`.

## Acceptance Criteria

- [x] A pure runtime assertion (`assertSingleTargetBatch`) lives in `packages/api-client/src/batching-invariants.ts` and throws `CrossPillarBatchError` when a batch contains ops resolving to more than one pillar URL (or mixes a pillar with the legacy catch-all).
- [x] A non-throwing variant (`checkSingleTargetBatch`) is exposed for dev-mode logging that returns a violation descriptor instead of throwing.
- [x] The error message references PRD-188 and the offending paths/targets, so consumers can surface a useful warning.
- [x] Tests at `packages/api-client/src/__tests__/batching-invariants.test.ts` cover: same-pillar batch passes, cross-pillar batch throws, mix of pillar + legacy throws, and the empty / single-op edge cases.
- [x] `mise lint` and `mise typecheck` pass.

> Audit of existing batch call sites is tracked under PRD-189. nginx dispatcher rules are tracked under PRD-190.

## Edge Cases

| Case                                           | Behaviour                                    |
| ---------------------------------------------- | -------------------------------------------- |
| A new page accidentally batches across pillars | Dev mode logs warning; CI test fails.        |
| A consumer manually composes URLs              | Not covered (we trust the splitLink config). |

## User Stories

| #   | Story                                                     | Summary                                                                   |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| 01  | [us-01-runtime-assertion](us-01-runtime-assertion.md)     | Dev-mode assertion logging cross-pillar batches                           |
| 02  | [us-02-ci-invariant-test](us-02-ci-invariant-test.md)     | E2E test: scan every page's tRPC traffic; assert single-namespace batches |
| 03  | [us-03-document-invariants](us-03-document-invariants.md) | Author `trpc.invariants.md` with the invariant list + rationale           |

## Out of Scope

- Server-side batching invariants. Servers don't batch; they serve.
- Production-mode assertion (perf overhead).
- Runtime fixes (just detection).
