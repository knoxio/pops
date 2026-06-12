# PRD-206: Dispatcher update + legacy mount deletion

> Epic: [Reclaim misnamed finance code](../../epics/08a-reclaim-misnamed-finance.md)

## Overview

Final cleanup PR of Epic 08a. Update nginx dispatcher to route `finance.corrections.*` and `finance.tagRules.*` to pops-finance-api. Delete the legacy mounts on pops-api. Verify M2 PR 3's deferred-delete becomes a real delete now that the misnamed code is no longer the blocker.

## Data Model

No data.

## API Surface

### nginx changes

```nginx
# Remove these regex blocks if they still exist:
# location ~ ^/trpc/core\.corrections\. { ... }
# location ~ ^/trpc/core\.tagRules\. { ... }

# Add these prefix matches (per PRD-190 style):
location /trpc-finance {
    proxy_pass http://finance-api:3004/trpc;
    include /etc/nginx/conf.d/_pillar-proxy.conf;
}
```

(`/trpc-finance` already exists from PRD-190; this PRD doesn't redo it.)

### pops-api changes

```diff
// apps/pops-api/src/router.ts
-  core: coreRouter,  // had .corrections + .tagRules subrouters
+  core: coreRouter,  // (with .corrections + .tagRules removed)
```

## Business Rules

- **Both legacy mounts are deleted from pops-api.**
- **The full M2 PR 3 deferred-delete is also re-evaluated.** If Epic 08a's reclaim removed the blocking dependencies, M2 PR 3's deletion happens here too — `finance.wishlist`, `finance.budgets`, `finance.transactions` mounts go away from pops-api.
- **nginx regex rules retire.** Prefix matches handle everything.

## Edge Cases

| Case                                                | Behaviour                                                     |
| --------------------------------------------------- | ------------------------------------------------------------- |
| External traffic hits `/trpc/core.corrections.list` | Returns 404 (no matching route on pops-api or pops-core-api). |
| Cached client still uses old path                   | Client refresh → uses new path.                               |

## User Stories

| #   | Story                                                         | Summary                                                         |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| 01  | [us-01-nginx-update](us-01-nginx-update.md)                   | Retire regex rules; rely on prefix dispatch                     |
| 02  | [us-02-pops-api-mount-delete](us-02-pops-api-mount-delete.md) | Delete legacy mounts                                            |
| 03  | [us-03-m2-pr3-recheck](us-03-m2-pr3-recheck.md)               | Verify M2 PR 3's deferred-delete is now possible; if yes, do it |
| 04  | [us-04-deploy-verify](us-04-deploy-verify.md)                 | Deploy + smoke-test the renamed namespaces                      |

## Out of Scope

- Per-procedure migration paths beyond what PRDs 203-205 cover.
- Documentation overhaul for the rename (handled in PRDs 184 + 185).
