# PRD-187: splitLink strategy

> Epic: [Batching fix](../../epics/04-batching-fix.md)

## Overview

Replace the shell's single `httpBatchLink` with tRPC's `splitLink` so each pillar's procedure calls flow through their own batch link. No cross-pillar batches ever form. This is the prerequisite for genuinely deleting legacy pops-api mounts. ADR-028 captures the decision; this PRD specifies the implementation.

## Data Model

No persistent data. tRPC client configuration changes only.

## API Surface

### Client configuration

```ts
// apps/pops-shell/src/lib/trpc.ts

import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, splitLink } from '@trpc/client';
import { PILLARS } from '@pops/pillar-sdk';

const pillarBatchLinks = Object.fromEntries(
  PILLARS.map((pillar) => [pillar, httpBatchLink({ url: `/trpc-${pillar}`, maxURLLength: 2083 })])
);

const legacyApiLink = httpBatchLink({ url: '/trpc', maxURLLength: 2083 });

export const trpc = createTRPCReact<AppRouter>({
  links: [
    splitLink({
      condition: (op) => {
        const namespace = op.path.split('.')[0];
        return namespace in pillarBatchLinks;
      },
      true: splitLink({
        condition: (op) => op.path.split('.')[0] === 'finance',
        true: pillarBatchLinks.finance,
        false: splitLink({
          /* repeat per pillar */
        }),
      }),
      false: legacyApiLink,
    }),
  ],
});
```

(Nested splitLink because tRPC's split is binary; could refactor to a custom link if it gets unwieldy.)

### URL prefixes per pillar

| Namespace     | URL prefix        | Routed to          |
| ------------- | ----------------- | ------------------ |
| `finance.*`   | `/trpc-finance`   | pops-finance-api   |
| `media.*`     | `/trpc-media`     | pops-media-api     |
| `core.*`      | `/trpc-core`      | pops-core-api      |
| `inventory.*` | `/trpc-inventory` | pops-inventory-api |
| `cerebrum.*`  | `/trpc-cerebrum`  | pops-cerebrum-api  |
| `food.*`      | `/trpc-food`      | pops-food-api      |
| `lists.*`     | `/trpc-lists`     | pops-lists-api     |
| Anything else | `/trpc`           | pops-api           |

## Business Rules

- **Each pillar has its own URL prefix.** Lets nginx do a simple prefix match instead of regex on procedure paths. Cleaner dispatcher rules; faster matching.
- **Every batch URL contains procedures from one pillar only.** The splitLink condition routes per-procedure to the right link based on the namespace.
- **The legacy `/trpc` link remains for anything not matching a pillar.** Catches `pops.health`, debug procedures, and anything still living on the monolith.
- **`maxURLLength: 2083` matches the current configuration.** Stays for compatibility with IE-era URL length limits.
- **The pillar list comes from `@pops/pillar-sdk`'s canonical `PILLARS` constant.** Adding a new pillar = add to the list; the splitLink picks it up automatically (combined with the registry-driven nginx config from PRD-217).
- **The pre-existing namespace-checking dispatcher rules (`^/trpc/finance\.[^,]+$` etc.) get retired in PRD-190.** Once splitLink lands, those regex rules become redundant.

## Edge Cases

| Case                                                            | Behaviour                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Procedure path has no namespace prefix (e.g. `health`)          | Falls through to legacy `/trpc` link.                                                  |
| New pillar added                                                | Add to `PILLARS`; the link list expands automatically.                                 |
| Procedure namespaced under a non-existent pillar                | Same as no-namespace: falls through to legacy.                                         |
| User calls a procedure during a deploy where one pillar is down | The pillar's batch URL fails; SDK error semantics preserved. Other pillars unaffected. |

## User Stories

| #   | Story                                                   | Summary                                                                                          |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01  | [us-01-pillar-list-import](us-01-pillar-list-import.md) | Import `PILLARS` from `@pops/pillar-sdk`; generate per-pillar batch links                        |
| 02  | [us-02-splitlink-config](us-02-splitlink-config.md)     | Wire `splitLink` with namespace-based routing                                                    |
| 03  | [us-03-legacy-fallthrough](us-03-legacy-fallthrough.md) | Confirm non-pillar procedures route to `/trpc`                                                   |
| 04  | [us-04-integration-tests](us-04-integration-tests.md)   | Test: every pillar's procedures hit the right URL; cross-pillar code paths use separate requests |

## Out of Scope

- nginx dispatcher rule simplification (PRD-190).
- Server-side cross-pillar batching. The server doesn't need to know about batching — each pillar serves its own batched URLs.
- Custom link plugins (e.g. retry-with-backoff). Existing behaviour preserved.
- Per-procedure batching tuning. One batch link per pillar; max-url-length consistent.
