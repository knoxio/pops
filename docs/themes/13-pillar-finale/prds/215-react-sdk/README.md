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

| #   | Story                                                 | Summary                |
| --- | ----------------------------------------------------- | ---------------------- |
| 01  | [us-01-provider](us-01-provider.md)                   | Provider component     |
| 02  | [us-02-usePillar](us-02-usePillar.md)                 | `usePillar` hook       |
| 03  | [us-03-useUriResolver](us-03-useUriResolver.md)       | URI resolution hook    |
| 04  | [us-04-usePillarRegistry](us-04-usePillarRegistry.md) | Registry snapshot hook |

## Out of Scope

- PillarGuard rewrite (PRD-216).
- Codegen of contract bindings.
