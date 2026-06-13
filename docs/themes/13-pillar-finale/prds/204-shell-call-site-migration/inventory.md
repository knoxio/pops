# PRD-204 — Shell tRPC call-site inventory

> Parent: [PRD-204](./README.md)
>
> Companion audit: [PRD-227](../227-sdk-consumer-migration-audit/README.md) — global consumer audit.
>
> Scope: every `trpc.*` access expression under `apps/pops-shell/src/`. Source of truth for the migration PRs that fall out of PRD-204 — the split is by feature area (see below); per-file PRs are unnecessary.

## Totals

| Bucket                        | Count |
| ----------------------------- | ----: |
| Procedure call sites          |     1 |
| Wiring / utility references   |     3 |
| **Total `trpc.*` references** |     4 |
| Files touched                 |     3 |

> Batch 1 of PRD-204 migrated the 7 unblocked trivial sites (rows 3, 4, 11, 12, 14, 15, 16). Batch 2 migrated the `use-feature-mutations.ts` block (rows 7, 8, 9, 10) and added the additive `PillarSdkProvider` mount to `App.tsx` (rows 1, 2). Remaining: NudgeIndicator (row 5, in flight as PRD-227 US-02 / PR #3055) plus the two risky dynamic-traversal sites (rows 6, 13). Original totals of 16 references / 10 files now stand at 4 references / 3 files.

### By category

| Category | Count | Notes                                                                                                                                                                                              |
| -------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trivial  |     0 | All unblocked trivial sites done.                                                                                                                                                                  |
| Medium   |     1 | NudgeIndicator polling shape — option-surface (`refetchInterval` + `Query` arg) is in flight on a separate canary PR (PRD-227 US-02 / #3055).                                                      |
| Risky    |     3 | Dynamic procedure-path traversal via `utils.client` (settings manifest `optionsLoader` + `testAction`). The SDK proxy is build-time-typed and does not currently support traversal by string path. |

### By pillar

| Pillar     | Procedure call sites | Routers touched                 |
| ---------- | -------------------: | ------------------------------- |
| `core`     |                   10 | `shell`, `settings`, `features` |
| `cerebrum` |                    1 | `nudges`                        |

Dynamic call sites (`useTestActionHandler`, `useTrpcOptionsLoaders`) are pillar-agnostic — the procedure path comes from runtime manifest data and may target any pillar.

### Files with > 5 call sites (natural per-file PR candidates)

None. The largest file is `use-feature-mutations.ts` with 4 references (3 procedure calls + `useUtils`). Per-file PRs are unnecessary; the natural split is by feature area:

- PR-A: `IndexRedirect`, `App` provider swap, `use-feature-enabled` — foundational.
- PR-B: `features-page/*` — `core.features.*` reads + mutations (5 sites).
- PR-C: `settings/SectionRenderer` + `CaptureHotkeyHost` — `core.settings.*` reads + mutation (3 sites).
- PR-D: `NudgeIndicator` — `cerebrum.nudges.list` with polling shape (1 site).
- PR-E (risky, design first): `useTestActionHandler` + `useTrpcOptionsLoaders` — dynamic traversal (2 files, 4 sites).

### Preconditions

| Site                                     | Precondition                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All `core.*` sites (10)                  | Core writer move (Track M1) complete and the `core` pillar reachable via the SDK discovery layer.                                                                                                                                                                                                        |
| `NudgeIndicator.tsx`                     | `usePillarQuery` options must expose `refetchInterval`, `retry`, and `staleTime`, **and** the `refetchInterval` callback must receive a query with `state.fetchFailureCount`. PRD-193 says the hook is a `useQuery` wrapper — confirm the option pass-through is total before scheduling this migration. |
| `App.tsx` provider                       | PRD-215 (`PillarSdkProvider`) merged and the shell-side query client is shared with both providers, or the new provider subsumes the old one cleanly.                                                                                                                                                    |
| `useTestActionHandler` / dynamic loaders | Requires a new SDK affordance — either `pillar(id).callDynamic(path, input)` or a manifest-aware helper. Until that lands, these sites cannot migrate without losing the settings-manifest UI feature.                                                                                                   |

## Per-site table

Path-relative to repo root. `Q` = query, `M` = mutation, `U` = utility/wiring.

|   # | File                                                                              | Line | Pillar.Router.Proc                                 | Kind | Hook            | Call shape                                                                                                                          | Category | Notes                                                                                                                                                                                            |
| --: | --------------------------------------------------------------------------------- | ---: | -------------------------------------------------- | :--: | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | apps/pops-shell/src/app/App.tsx                                                   |   54 | —                                                  |  U   | `trpc.Provider` | `<trpc.Provider client={trpcClient} queryClient={queryClient}>`                                                                     | Done     | PRD-204 batch 2 mounted `PillarSdkProvider` additively alongside the existing `trpc.Provider`. Full swap waits on the remaining tRPC consumers (rows 5/6/13) migrating.                          |
|   2 | apps/pops-shell/src/app/App.tsx                                                   |   64 | —                                                  |  U   | `trpc.Provider` | `</trpc.Provider>`                                                                                                                  | Done     | Pair of (1).                                                                                                                                                                                     |
|   3 | apps/pops-shell/src/app/IndexRedirect.tsx                                         |   16 | `core.shell.manifest`                              |  Q   | `useQuery`      | `trpc.core.shell.manifest.useQuery(undefined, { staleTime: Infinity })`                                                             | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1. Falls back to `/finance` on `isUnavailable` / `isContractMismatch`.                                                                             |
|   4 | apps/pops-shell/src/app/capture/CaptureHotkeyHost.tsx                             |   14 | `core.settings.get`                                |  Q   | `useQuery`      | `trpc.core.settings.get.useQuery({ key: settingKey })`                                                                              | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1. Falls back to the default hotkey on unavailable / contract-mismatch.                                                                            |
|   5 | apps/pops-shell/src/app/layout/top-bar/NudgeIndicator.tsx                         |   32 | `cerebrum.nudges.list`                             |  Q   | `useQuery`      | `trpc.cerebrum.nudges.list.useQuery({ status, limit }, { retry: false, staleTime: 30_000, refetchInterval: nudgeRefetchInterval })` | Medium   | Custom `refetchInterval` reads `query.state.fetchFailureCount` — option surface must pass the raw React Query `Query` object through. Blocker until the SDK hook's option contract is confirmed. |
|   6 | apps/pops-shell/src/app/pages/settings-page/useTestActionHandler.ts               |   18 | dynamic (`pillar.router.proc` resolved at runtime) |  U   | `useUtils`      | `const utils = trpc.useUtils(); ... traverseTrpcPath(utils.client, procedure)`                                                      | Risky    | Dynamic procedure-path traversal. The pillar-sdk proxy is build-time-typed; there is no `pillar(id).callDynamic(path)` equivalent today.                                                         |
|   7 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   17 | —                                                  |  U   | `useUtils`      | `const utils = trpc.useUtils()` (for `utils.core.features.list.invalidate()`)                                                       | Done     | Removed in PRD-204 batch 2. `usePillarMutation` auto-invalidates the `[core, features]` prefix on success, which covers `features.list`, `features.getManifests`, and `features.isEnabled`.      |
|   8 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   20 | `core.features.setEnabled`                         |  M   | `useMutation`   | `trpc.core.features.setEnabled.useMutation({ onSuccess })`                                                                          | Done     | Migrated to `usePillarMutation` in PRD-204 batch 2.                                                                                                                                              |
|   9 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   21 | `core.features.setUserPreference`                  |  M   | `useMutation`   | `trpc.core.features.setUserPreference.useMutation({ onSuccess })`                                                                   | Done     | Migrated to `usePillarMutation` in PRD-204 batch 2.                                                                                                                                              |
|  10 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   22 | `core.features.clearUserPreference`                |  M   | `useMutation`   | `trpc.core.features.clearUserPreference.useMutation({ onSuccess })`                                                                 | Done     | Migrated to `usePillarMutation` in PRD-204 batch 2.                                                                                                                                              |
|  11 | apps/pops-shell/src/app/pages/features-page/FeaturesPage.tsx                      |   28 | `core.features.getManifests`                       |  Q   | `useQuery`      | `trpc.core.features.getManifests.useQuery()`                                                                                        | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1.                                                                                                                                                 |
|  12 | apps/pops-shell/src/app/pages/features-page/FeaturesPage.tsx                      |   29 | `core.features.list`                               |  Q   | `useQuery`      | `trpc.core.features.list.useQuery()`                                                                                                | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1.                                                                                                                                                 |
|  13 | apps/pops-shell/src/components/settings/section-renderer/useTrpcOptionsLoaders.ts |   11 | dynamic                                            |  U   | `useUtils`      | `const utils = trpc.useUtils(); ... traverseTrpcPath(utilsRef.current.client, procedure)`                                           | Risky    | Same dynamic-traversal problem as (6). Procedure names come from `SettingsManifest.optionsLoader`.                                                                                               |
|  14 | apps/pops-shell/src/components/settings/SectionRenderer.tsx                       |   46 | `core.settings.getBulk`                            |  Q   | `useQuery`      | `trpc.core.settings.getBulk.useQuery({ keys: allKeys })`                                                                            | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1.                                                                                                                                                 |
|  15 | apps/pops-shell/src/components/settings/SectionRenderer.tsx                       |   47 | `core.settings.setBulk`                            |  M   | `useMutation`   | `trpc.core.settings.setBulk.useMutation()`                                                                                          | Done     | Migrated to `usePillarMutation` in PRD-204 batch 1. `useAutoSave` only uses `mutate(input, { onSuccess, onError })` — compatible across hook surfaces.                                           |
|  16 | apps/pops-shell/src/lib/use-feature-enabled.ts                                    |   11 | `core.features.isEnabled`                          |  Q   | `useQuery`      | `trpc.core.features.isEnabled.useQuery({ key })`                                                                                    | Done     | Migrated to `usePillarQuery` in PRD-204 batch 1. Falls back to caller-supplied default on unavailable / contract-mismatch.                                                                       |

## Notes on cross-cutting patterns

- **`utils.client` traversal** — used in (6) and (13). The `traverseTrpcPath` helper walks the tRPC client proxy by a `pillar.router.proc` string and calls `.query()` / `.mutate()` on the resolved node. The pillar-sdk's `pillar(id)` proxy is typed off the contract package and rejects unknown router segments at compile time; there is no public string-path entry point today. Either:
  1. Extend `@pops/pillar-sdk/client` with a `pillar(id).callDynamic(path: string[], input: unknown): Promise<CallResult<unknown>>` escape hatch; or
  2. Project the settings manifest at build time into a typed enum of allowed procedures and call those by name.
     This decision must land before (6) and (13) can migrate. It is out of scope for PRD-204 and should be tracked as a follow-up PRD under epic 10.
- **Manual cache invalidation** — (7) calls `utils.core.features.list.invalidate()` from `onSuccess`. `usePillarMutation` already invalidates the router prefix `[pillarId, ...path.slice(0, -1)]` on success, which covers `features.list`. The manual invalidate becomes redundant after migration — keep the consumer-supplied `onSuccess` for side effects only.
- **Provider swap** — (1) and (2) are the same React element opened and closed. Counted as two references for grep accuracy but they migrate as a single edit.
- **Cross-pillar batching** — none. All current shell call sites are single-pillar per render. PRD-188's invariant holds.
- **Optimistic updates** — none of the current shell call sites use `onMutate` + `setQueryData` optimistic patterns.
- **Suspense** — none of the current shell call sites use `useSuspenseQuery`.
