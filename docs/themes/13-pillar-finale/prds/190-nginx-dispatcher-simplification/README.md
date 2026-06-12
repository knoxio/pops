# PRD-190: nginx dispatcher simplification

> Epic: [Batching fix](../../epics/04-batching-fix.md)

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

| #   | Story                                                       | Summary                                                        |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| 01  | [us-01-shared-proxy-partial](us-01-shared-proxy-partial.md) | Author `_pillar-proxy.conf` with shared headers + timeouts     |
| 02  | [us-02-prefix-locations](us-02-prefix-locations.md)         | Add prefix-match `location /trpc-<pillar>` for every pillar    |
| 03  | [us-03-retire-regex-rules](us-03-retire-regex-rules.md)     | Delete the old regex rules; keep `/trpc` fallthrough           |
| 04  | [us-04-redeploy-verify](us-04-redeploy-verify.md)           | Build new pops-shell image; deploy to capivara; verify routing |

## Out of Scope

- Generated nginx config (PRD-217).
- Adding more dispatchers (Epic 10).
- Cross-host nginx (single-host assumption).
