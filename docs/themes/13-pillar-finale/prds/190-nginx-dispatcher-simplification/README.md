# PRD-190: nginx dispatcher simplification

> Epic: [Batching fix](../../epics/04-batching-fix.md)
>
> Status: **Partial** — config rewritten and locally validated; capivara redeploy verification deferred.

## Overview

With splitLink (PRD-187) in place, the shell never emits cross-pillar batched URLs. The complex per-procedure regex rules in nginx (`^/trpc/finance\.[^,]+$`) become unnecessary — simple prefix matches on the new per-pillar URL prefixes (`/trpc-finance`) work. This PRD retires the regex rules and replaces them with clean prefix-match locations.

## Data Model

No data. nginx config change.

## API Surface

### Before (Theme 12 era)

```nginx
location ~ ^/trpc/finance\.[^,]+$ {
    set $finance_upstream http://finance-api:3004;
    proxy_pass $finance_upstream;
    # ... 8 lines of timeouts + headers
}
# Repeat for inventory, media, core, cerebrum...
```

### After (PRD-190)

```nginx
location /trpc-finance {
    proxy_pass http://finance-api:3004/trpc;
    include /etc/nginx/conf.d/_pillar-proxy.conf;
}
location /trpc-media {
    proxy_pass http://media-api:3003/trpc;
    include /etc/nginx/conf.d/_pillar-proxy.conf;
}
# Repeat per pillar
```

The shared `_pillar-proxy.conf` partial holds the timeouts + headers, eliminating duplication.

## Business Rules

- **Prefix match replaces regex.** Faster nginx matching; clearer config.
- **Each pillar's URL strips the prefix on proxy_pass.** `/trpc-finance/foo` → `http://finance-api:3004/trpc/foo`.
- **Legacy regex rules are deleted.** Old `^/trpc/finance\.[^,]+$` blocks are removed.
- **`/trpc` (no prefix) remains the legacy pops-api fallthrough.**
- **The shared partial `_pillar-proxy.conf` lives at `apps/pops-shell/nginx/conf.d/_pillar-proxy.conf`.**

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Old client (cached page) still uses `/trpc/finance.transactions.list` (no prefix) | Falls through to `/trpc` → pops-api → 404 (since legacy mount may have been deleted in Epic 08a). Acceptable; client reload picks up new URLs. |
| Pillar is missing                                                                 | Variable-form proxy_pass still defers DNS to request time (per the Theme 12 pattern); 502 + PillarGuard fallback.                              |

## User Stories

| #   | Story                                                       | Summary                                                        | Status      |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| 01  | [us-01-shared-proxy-partial](us-01-shared-proxy-partial.md) | Author `_pillar-proxy.conf` with shared headers + timeouts     | Done        |
| 02  | [us-02-prefix-locations](us-02-prefix-locations.md)         | Add prefix-match `location /trpc-<pillar>` for every pillar    | Done        |
| 03  | [us-03-retire-regex-rules](us-03-retire-regex-rules.md)     | Delete the old regex rules; keep `/trpc` fallthrough           | Done        |
| 04  | [us-04-redeploy-verify](us-04-redeploy-verify.md)           | Build new pops-shell image; deploy to capivara; verify routing | Not started |

## Acceptance Criteria

- [x] Shared `_pillar-proxy.conf` partial authored at `apps/pops-shell/nginx/conf.d/_pillar-proxy.conf` and installed into the image at `/etc/nginx/snippets/_pillar-proxy.conf` (kept out of `conf.d/` to avoid nginx auto-loading the partial as a server block).
- [x] One prefix-match `location /trpc-<pillar>/` per pillar (core, inventory, media, finance, food, lists, cerebrum), each rewriting `/trpc-<pillar>/<rest>` → `/trpc/<rest>` and proxying to the variable-form upstream so pops-shell still boots when a pillar container is absent.
- [x] All five legacy regex dispatchers (`^/trpc/inventory\.locations\.[^,]+$`, `^/trpc/cerebrum\.nudges\.(list|get|dismiss|contradictions)$`, `^/trpc/media\.shelfImpressions\.`, `^/trpc/core\.serviceAccounts\.`, `^/trpc/finance\.((wishlist|budgets)\.[^,]+|transactions\.(list|get|create|update|delete|restore))$`) deleted.
- [x] Legacy `/trpc` catch-all to pops-api retained for orchestration code and pre-PRD-187 cached SPA bundles.
- [x] Smoke harness `apps/pops-shell/scripts/validate-nginx-conf.sh` runs `nginx -t` against the merged config inside `nginx:alpine`; skips gracefully when Docker isn't available, fails hard under `REQUIRE_DOCKER=1`.
- [ ] US-04 redeploy/verify on capivara (out of this PR's scope; deferred to the Theme 13 deploy wave).

## Out of Scope

- Generated nginx config (PRD-217).
- Adding more dispatchers (Epic 10).
- Cross-host nginx (single-host assumption).
