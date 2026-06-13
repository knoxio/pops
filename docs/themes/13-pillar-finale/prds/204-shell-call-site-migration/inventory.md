# PRD-204 — Shell tRPC call-site inventory

> Parent: [PRD-204](./README.md)
>
> Companion audit: [PRD-227](../227-sdk-consumer-migration-audit/README.md) — global consumer audit.
>
> Scope: every `trpc.*` access expression under `apps/pops-shell/src/`. Source of truth for the migration PRs that fall out of PRD-204 — the split is by feature area (see below); per-file PRs are unnecessary.

## Totals

| Bucket                        | Count |
| ----------------------------- | ----: |
| Procedure call sites          |    11 |
| Wiring / utility references   |     5 |
| **Total `trpc.*` references** |    16 |
| Files touched                 |    10 |

### By category

| Category | Count | Notes                                                                                                                                                                                                           |
| -------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trivial  |     7 | Direct `useQuery` / `useMutation` rename to `usePillarQuery` / `usePillarMutation`, ≤ 5 LOC delta per site.                                                                                                     |
| Medium   |     6 | Provider swap (`App.tsx`), manual `utils.*.invalidate` whose semantics overlap with the SDK's built-in router-prefix invalidation, and the NudgeIndicator polling shape that needs option-surface verification. |
| Risky    |     3 | Dynamic procedure-path traversal via `utils.client` (settings manifest `optionsLoader` + `testAction`). The SDK proxy is build-time-typed and does not currently support traversal by string path.              |

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
|   1 | apps/pops-shell/src/app/App.tsx                                                   |   54 | —                                                  |  U   | `trpc.Provider` | `<trpc.Provider client={trpcClient} queryClient={queryClient}>`                                                                     | Medium   | Provider wiring, not a procedure. Swap to `PillarSdkProvider` (PRD-215). Closing tag on line 64 is the same site.                                                                                |
|   2 | apps/pops-shell/src/app/App.tsx                                                   |   64 | —                                                  |  U   | `trpc.Provider` | `</trpc.Provider>`                                                                                                                  | Medium   | Pair of (1).                                                                                                                                                                                     |
|   3 | apps/pops-shell/src/app/IndexRedirect.tsx                                         |   16 | `core.shell.manifest`                              |  Q   | `useQuery`      | `trpc.core.shell.manifest.useQuery(undefined, { staleTime: Infinity })`                                                             | Trivial  | `staleTime` passthrough is supported by the underlying `useQuery`.                                                                                                                               |
|   4 | apps/pops-shell/src/app/capture/CaptureHotkeyHost.tsx                             |   14 | `core.settings.get`                                |  Q   | `useQuery`      | `trpc.core.settings.get.useQuery({ key: settingKey })`                                                                              | Trivial  | Plain query, no extra options.                                                                                                                                                                   |
|   5 | apps/pops-shell/src/app/layout/top-bar/NudgeIndicator.tsx                         |   32 | `cerebrum.nudges.list`                             |  Q   | `useQuery`      | `trpc.cerebrum.nudges.list.useQuery({ status, limit }, { retry: false, staleTime: 30_000, refetchInterval: nudgeRefetchInterval })` | Medium   | Custom `refetchInterval` reads `query.state.fetchFailureCount` — option surface must pass the raw React Query `Query` object through. Blocker until the SDK hook's option contract is confirmed. |
|   6 | apps/pops-shell/src/app/pages/settings-page/useTestActionHandler.ts               |   18 | dynamic (`pillar.router.proc` resolved at runtime) |  U   | `useUtils`      | `const utils = trpc.useUtils(); ... traverseTrpcPath(utils.client, procedure)`                                                      | Risky    | Dynamic procedure-path traversal. The pillar-sdk proxy is build-time-typed; there is no `pillar(id).callDynamic(path)` equivalent today.                                                         |
|   7 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   17 | —                                                  |  U   | `useUtils`      | `const utils = trpc.useUtils()` (for `utils.core.features.list.invalidate()`)                                                       | Medium   | `usePillarMutation` auto-invalidates the `[pillar, ...routerPrefix]` queryKey on success. Manual invalidation here is redundant once migrated — drop it or rely on the built-in.                 |
|   8 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   20 | `core.features.setEnabled`                         |  M   | `useMutation`   | `trpc.core.features.setEnabled.useMutation({ onSuccess })`                                                                          | Trivial  | After (7) is resolved, this is a direct rename.                                                                                                                                                  |
|   9 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   21 | `core.features.setUserPreference`                  |  M   | `useMutation`   | `trpc.core.features.setUserPreference.useMutation({ onSuccess })`                                                                   | Trivial  | Same as (8).                                                                                                                                                                                     |
|  10 | apps/pops-shell/src/app/pages/features-page/use-feature-mutations.ts              |   22 | `core.features.clearUserPreference`                |  M   | `useMutation`   | `trpc.core.features.clearUserPreference.useMutation({ onSuccess })`                                                                 | Trivial  | Same as (8).                                                                                                                                                                                     |
|  11 | apps/pops-shell/src/app/pages/features-page/FeaturesPage.tsx                      |   28 | `core.features.getManifests`                       |  Q   | `useQuery`      | `trpc.core.features.getManifests.useQuery()`                                                                                        | Trivial  | No options.                                                                                                                                                                                      |
|  12 | apps/pops-shell/src/app/pages/features-page/FeaturesPage.tsx                      |   29 | `core.features.list`                               |  Q   | `useQuery`      | `trpc.core.features.list.useQuery()`                                                                                                | Trivial  | No options.                                                                                                                                                                                      |
|  13 | apps/pops-shell/src/components/settings/section-renderer/useTrpcOptionsLoaders.ts |   11 | dynamic                                            |  U   | `useUtils`      | `const utils = trpc.useUtils(); ... traverseTrpcPath(utilsRef.current.client, procedure)`                                           | Risky    | Same dynamic-traversal problem as (6). Procedure names come from `SettingsManifest.optionsLoader`.                                                                                               |
|  14 | apps/pops-shell/src/components/settings/SectionRenderer.tsx                       |   46 | `core.settings.getBulk`                            |  Q   | `useQuery`      | `trpc.core.settings.getBulk.useQuery({ keys: allKeys })`                                                                            | Trivial  | Plain query.                                                                                                                                                                                     |
|  15 | apps/pops-shell/src/components/settings/SectionRenderer.tsx                       |   47 | `core.settings.setBulk`                            |  M   | `useMutation`   | `trpc.core.settings.setBulk.useMutation()`                                                                                          | Trivial  | Plain mutation, passed as `setBulkMutation` to `useAutoSave`. Verify `useAutoSave` only uses `mutate` / `mutateAsync` / `isPending` — those are common to both hook surfaces.                    |
|  16 | apps/pops-shell/src/lib/use-feature-enabled.ts                                    |   11 | `core.features.isEnabled`                          |  Q   | `useQuery`      | `trpc.core.features.isEnabled.useQuery({ key })`                                                                                    | Trivial  | Trivial.                                                                                                                                                                                         |

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
