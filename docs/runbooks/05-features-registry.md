# 05 — Features registry (the deferred cross-pillar port)

Parent: [`00-completion-overview.md`](./00-completion-overview.md). This is the **one remaining
backend epic** blocking the final FE cleanup: `pops-shell` calls `features.*`, which has no REST
backend (deferred during the lake migration). Standing it up on the core pillar is the prerequisite
for converting the shell off `usePillar*` and retiring the pillar-sdk data hooks (G1's letter).

## Goal

Restore the **6 `features.*` procedures** on `pillars/core` over REST, sourcing feature declarations
from a **cross-pillar manifest registry**, so that:

- The shell's Features admin page and `useFeatureEnabled` gate work again over `/core-api`.
- `usePillar*` can be fully retired from the shell (the last `usePillar*` holdout).
- A live regression is fixed in passing: the shell calls `settings.getBulk`/`setBulk`, but core
  serves `settings.getMany`/`setMany` — settings load/save is broken today.

## Recovered behaviour (from the deleted monolith `modules/core/features`, `6b0cc148^`)

Six procedures, **all identity-dependent** (`ctx.user.email` for per-user prefs):

| Proc                  | Shape                                   | Notes                             |
| --------------------- | --------------------------------------- | --------------------------------- |
| `getManifests`        | `() → { manifests: FeatureManifest[] }` | the declared feature groups       |
| `list`                | `(ctx) → { features: FeatureStatus[] }` | resolved state for the admin page |
| `isEnabled`           | `({ key }, ctx) → { enabled: boolean }` | the runtime gate                  |
| `setEnabled`          | `({ key, enabled }) → { enabled }`      | system/global flag                |
| `setUserPreference`   | `({ key, enabled }, ctx) → { enabled }` | per-user override                 |
| `clearUserPreference` | `({ key }, ctx) → { cleared }`          | drop the override                 |

**Resolution order** (`isEnabled` / `buildFeatureStatus`): capability check → required credentials →
user override → system value → `default`. `FeatureStatus.state` ∈ `enabled | disabled | unavailable`.

**Storage** maps cleanly onto core's existing tables — **no new tables**:

- system flags → core `settings` (`setRawSetting`/`getSettingOrNull`, key `feature.settingKey ?? key`)
- per-user prefs → core `user_settings` (per `email`, key `feature.<key>`)

**Types already exist** (`@pops/types/feature-manifest.ts`): `FeatureScope = system|user|capability`,
`FeatureDefinition`, `FeatureManifest`, `FeatureStatus`. And `ModuleManifest` (`module-manifest.ts:201`)
**already has a `features?: readonly FeatureManifest[]` slot**.

## The crux — two cross-pillar pieces

### 1. Manifest aggregation (straightforward — the mechanism exists)

The monolith read `installedManifests().flatMap(m => m.features)`. The pillar-world equivalent is
**`@pops/module-registry`**, which already aggregates every pillar's `ModuleManifest`. So:

- Each pillar declares its features in its `ModuleManifest.features` slot (static `FeatureManifest`).
- The core features service reads the aggregated set from `@pops/module-registry` (`MODULES.flatMap(m => m.features ?? [])`) instead of the deleted `installed-modules.js`.

This is data + a new read source. No runtime cross-pillar calls.

### 2. Capability probes (the genuinely-new design)

`FeatureDefinition.capabilityCheck` was a **runtime function** (`getRedisStatus()`, `isVecAvailable()`).
Static manifest data aggregated by `module-registry` cannot carry live probes, and `cerebrum.vectorSearch`
probes **cerebrum**, which core can't check locally. **Decision needed — recommended design:**

> Replace the inline `capabilityCheck()` with a **declarative** `capability: { pillar, key }` on the
> `FeatureDefinition`, and have each pillar **report its capability status through the existing registry
> heartbeat** (pillars already register + heartbeat to core). Core's features service resolves a
> capability feature against the registry's last-reported capability snapshot for the owning pillar —
> no extra REST round-trip, reuses the boot-resilient registry path.

Alternatives (record in the doc's decision, don't build both): (a) lazy `GET /<pillar>-api/capabilities`
from core when building `FeatureStatus` (simpler, adds latency + a failure mode); (b) **phase it** — v1
ships only **core-local** capabilities (`core.redis`), relocates `cerebrum.vectorSearch` to cerebrum-reported
in v2. The heartbeat-snapshot design is preferred because it's pull-free and matches how `/pillars` already
carries per-pillar liveness.

## Slices (build order; parallelism noted)

| #      | Slice                                                      | Parallel? | What                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | features service → `pillars/core/src/api/modules/features` | — (first) | Port `service.ts` + `user-settings`/`credentials`/`errors`; source manifests from `@pops/module-registry`; flags→`settings`, prefs→`user_settings`. Capability resolution stubbed to core-local for now.                                                                                                              |
| **S2** | ts-rest `features.*` contract + handlers + identity        | after S1  | `rest-features.ts` (6 ops), handler factories over S1's service, `x-pops-user`→`ctx.user` (reuse core's middleware), `generate:openapi` (adds `features.*`), `api-types`.                                                                                                                                             |
| **S3** | capability registry mechanism                              | ∥ with S4 | Declarative `capability:{pillar,key}`; extend pillar register/heartbeat to report capability flags; core resolves against the registry snapshot. (Or v1-defer per the decision above.)                                                                                                                                |
| **S4** | declare feature manifests in pillar `ModuleManifest`s      | ∥ with S3 | Move the capability/feature declarations into the owning pillars' manifests (`core.redis`→core, `cerebrum.vectorSearch`→cerebrum, app features→their pillars); regen `module-registry`.                                                                                                                               |
| **S5** | shell conversion + bug fix + hook retirement               | after S2  | Convert the shell's 6 `usePillar*` files (features + `settings.getBulk`→**`getMany`** + `setBulk`→**`setMany`** + `shell.manifest`) to the `core-api` Hey client; keep the generic `callDynamic` loaders (rename `useTrpcOptionsLoaders.ts`); delete the now-unused pillar-sdk `usePillarQuery/Mutation/Utils` hooks. |

S1→S2→S5 is the critical path; S3 ∥ S4 fill in the registry. A **v1 cut** (core-local capabilities,
defer S3 cross-pillar) can land S5 early and unblock the shell, with cross-pillar capabilities as a follow-up.

## Verification (Done when)

| #   | Check                  | Signal                                                                                                                                                                                                                  |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | features over REST     | `pillars/core/openapi/core.openapi.json` has `features.{isEnabled,setEnabled,setUserPreference,clearUserPreference,getManifests,list}`; `pnpm --filter @pops/core generate:openapi` idempotent (`git diff --exit-code`) |
| V2  | resolution parity      | port `service.test.ts`; capability→credentials→user-override→system→default order preserved; `state` ∈ enabled/disabled/unavailable                                                                                     |
| V3  | identity gated         | `setUserPreference`/`clearUserPreference`/`isEnabled` read `ctx.user.email` via the dispatcher's `x-pops-user`                                                                                                          |
| V4  | settings bug fixed     | shell settings load/save hits `settings.getMany`/`setMany`; round-trips over `/core-api`                                                                                                                                |
| V5  | shell off `usePillar*` | `rg "usePillar(Query\|Mutation\|Utils)\s*[(<]" apps/pops-shell/src` → 0; `useTrpcOptionsLoaders.ts` renamed                                                                                                             |
| V6  | hooks retired          | `usePillarQuery/Mutation/Utils` deleted from `packages/pillar-sdk/src/react` (generic `pillar()`/`usePillarSdkOptions`/SSE kept); `rg "usePillar(Query\|Mutation\|Utils)"` → 0 repo-wide                                |
| V7  | G1 clears              | the global `usePillar`/`@trpc` grep (G1) is **0 hits** outside docs/comments — migration's literal end-state met                                                                                                        |
| V8  | green                  | `pnpm --filter @pops/core typecheck+test`, repo `pnpm typecheck`, `lint:boundaries:verify` all green                                                                                                                    |

## Out of scope (separate tracked debt — not this epic)

- **Playwright harness is broken**: `apps/pops-shell/playwright.config.ts` `webServer` points at the
  deleted `apps/pops-api` (`cwd: '../pops-api'`); `global-setup/teardown` call `:3000/env/e2e`. No e2e
  runs until the harness targets the pillar stack. Plus several e2e specs beyond the rewired 6 still
  reference `/trpc`. File as its own cleanup.
- Prod GHCR image rename + publish/cutover — the deploy step.

## Gotchas

- **Don't fork settings storage.** Features reuse core `settings` (system) + `user_settings` (user) — the
  same services the PRD-247 surface already exposes. Flip the read source, don't add tables.
- **Capability ≠ toggle.** `scope: 'capability'` features are runtime-probe-only (not user-settable);
  preserve `state: 'unavailable'` when the probe is down.
- **`FeatureNotFoundError` is intentional** (PRD-101): a key not declared by any installed manifest is a
  bug, not a silent `false`. Keep that behaviour after the registry-source swap.
