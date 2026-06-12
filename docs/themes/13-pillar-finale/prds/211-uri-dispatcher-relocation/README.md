# PRD-211: URI dispatcher relocation

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)

## Overview

Fold the URI dispatcher into the registry — no central dispatcher service. Each pillar's manifest declares its URI types (PRD-155); consumers query the registry to find which pillar resolves which URI scheme, then call the pillar directly.

## Data Model

No new data; uses the registry.

## API Surface

```ts
// @pops/pillar-sdk/uri

export async function resolveUri(uri: string): Promise<UriResolution>;

type UriResolution =
  | { kind: 'ok'; entity: { type: string; data: unknown } }
  | { kind: 'unknown-scheme'; uri: string }
  | { kind: 'pillar-unavailable'; pillar: string }
  | { kind: 'not-found' };
```

Implementation:

1. Parse URI: `pops:finance/transaction/abc` → pillar='finance', type='transaction', id='abc'.
2. Look up pillar in registry.
3. Find URI handler for the type in pillar's manifest.
4. Call the handler procedure via the SDK.

## Business Rules

- **No central dispatcher service.** Caller-side resolution via SDK.
- **URI types declared in manifests** (per PRD-155).
- **Each pillar implements its own URI handler procedures.**
- **Cerebrum's existing dispatcher (M5) becomes the SDK-resolveUri callers** — fold logic into SDK; cerebrum just uses it.

## Edge Cases

| Case                                    | Behaviour                     |
| --------------------------------------- | ----------------------------- |
| URI scheme not registered by any pillar | Returns `unknown-scheme`.     |
| Pillar drops mid-resolution             | Returns `pillar-unavailable`. |
| URI is malformed                        | Returns `unknown-scheme`.     |

## User Stories

| #   | Story                                                               | Summary                                         |
| --- | ------------------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-resolveUri-sdk](us-01-resolveUri-sdk.md)                     | Implement `resolveUri` in pillar-sdk            |
| 02  | [us-02-fold-cerebrum-dispatcher](us-02-fold-cerebrum-dispatcher.md) | Cerebrum's existing dispatcher delegates to SDK |
| 03  | [us-03-tests](us-03-tests.md)                                       | URI resolution against synthetic registry       |

## Out of Scope

- URI caching.
- Bulk URI resolution (one-at-a-time).
- New URI schemes (each pillar adds its own via manifest).
