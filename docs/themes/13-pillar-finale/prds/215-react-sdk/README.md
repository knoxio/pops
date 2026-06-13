# PRD-215: React SDK

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)

## Overview

Compose all the SDK pieces into a React-ergonomic surface for the shell. Builds on PRDs 193 (React hooks) and 194 (cache invalidation), adds a `<PillarSdkProvider>`, `usePillar()`, `useUriResolver()`, `usePillarRegistry()` hooks.

## Data Model

No data.

## API Surface

```ts
// @pops/pillar-sdk/react

export function PillarSdkProvider({ children, ... }): JSX.Element;
export function usePillar<P extends KnownPillarId>(p: P): CallablePillar<ContractFor<P>>;
export function usePillarRegistry(): RegistrySnapshot;
export function useUriResolver(uri: string): UriResolution | undefined;
```

## Business Rules

- **Provider at root** wires registry + cache invalidation + auth context.
- **Hooks integrate with React Query** for caching + invalidation.
- **`useUriResolver` is async-shaped** via React Suspense or React Query.

## Edge Cases

| Case                         | Behaviour                                                    |
| ---------------------------- | ------------------------------------------------------------ |
| Provider missing             | Hooks throw at first call with "PillarSdkProvider required." |
| Pillar registered mid-render | Re-render via subscription event invalidates affected hooks. |

## User Stories

| #   | Story                                                 | Summary                | Status      |
| --- | ----------------------------------------------------- | ---------------------- | ----------- |
| 01  | [us-01-provider](us-01-provider.md)                   | Provider component     | Done        |
| 02  | [us-02-usePillar](us-02-usePillar.md)                 | `usePillar` hook       | Not started |
| 03  | [us-03-useUriResolver](us-03-useUriResolver.md)       | URI resolution hook    | Not started |
| 04  | [us-04-usePillarRegistry](us-04-usePillarRegistry.md) | Registry snapshot hook | Not started |

## Implementation Status

**Overall: Partial.** The composition layer (`PillarSdkProvider` + cache-invalidation bridge) is in place and is shared with PRD-193 (React Query hooks) and PRD-194 (SSE cache invalidation). The three PRD-215-specific hooks — `usePillar`, `useUriResolver`, `usePillarRegistry` — are not implemented; the React surface currently exposes `usePillarQuery` / `usePillarMutation` (PRD-193) instead of a `CallablePillar`-shaped `usePillar`.

US files (`us-01-provider.md` … `us-04-usePillarRegistry.md`) are not authored. Acceptance criteria below are derived from this PRD's Overview, API Surface, Business Rules, and Edge Cases.

### Acceptance criteria

| US  | Criterion                                                                                                                                  | Status      | Notes                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | `<PillarSdkProvider>` exported from `@pops/pillar-sdk/react`; wires registry + cache invalidation + auth context at the root.              | Done        | Provider exists; forwards `PillarClientOptions` via context; mounts `usePillarSubscriptionBridge` when `subscribe` is set; composes with an outer `QueryClientProvider` or wires one when given.       |
| 01  | Provider-missing edge case: hooks throw "PillarSdkProvider required." at first call.                                                       | Dropped     | Implementation intentionally falls back to empty `PillarClientOptions` so hooks work without a provider (defaults to `pillar()` built-ins). Behavioural deviation from the PRD; update PRD or hooks.   |
| 02  | `usePillar<P>(p)` returns a `CallablePillar<ContractFor<P>>` bound to the active provider options.                                         | Not started | No `usePillar` export. Equivalent today is calling `pillar(pillarId, options)` directly or `usePillarQuery` / `usePillarMutation` from PRD-193.                                                        |
| 02  | Pillar-registered-mid-render: subscription event invalidates affected hooks; re-render picks up the new pillar.                            | Partial     | `usePillarSubscriptionBridge` invalidates the matching React Query prefix on `pillar.registered` / `deregistered` / `health-changed` / `snapshot`. Re-render path is via React Query, not `usePillar`. |
| 03  | `useUriResolver(uri)` resolves a URI through the registry; async-shaped via Suspense or React Query; returns `UriResolution \| undefined`. | Not started | No `useUriResolver` export. No `UriResolution` type. No URI-resolver implementation in `packages/pillar-sdk/src/`.                                                                                     |
| 04  | `usePillarRegistry()` returns a `RegistrySnapshot` from context; updates on subscription events.                                           | Not started | No `usePillarRegistry` export. `RegistrySnapshot` and `pillarRegistry()` exist in `discovery/`; the hook wrapping is missing.                                                                          |

### Overlap with PRD-193

PRD-215 frames PRD-193 as a dependency ("Builds on PRDs 193 and 194"). The current React surface (`PillarSdkProvider`, `usePillarQuery`, `usePillarMutation`, `usePillarSubscriptionBridge`) satisfies PRD-193's hook surface and PRD-194's invalidation bridge; the provider is the shared composition point. PRD-215's net-new surface is just the three contract-shaped hooks (`usePillar`, `usePillarRegistry`, `useUriResolver`) and the provider-missing throw behaviour — none of which are implemented yet.

## Out of Scope

- PillarGuard rewrite (PRD-216).
- Codegen of contract bindings.
