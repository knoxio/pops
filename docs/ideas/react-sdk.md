# Contract-shaped React hooks

Net-new React hooks on top of the shipped [React SDK](../themes/federation/prds/react-sdk.md) provider. None of these exist in `libs/sdk/src/react` today — the surface there is `PillarSdkProvider`, `usePillarSdkOptions`, `pillarQueryKey`, and the subscription bridge. The pieces below would bind the existing `pillar()` client, `pillarRegistry()` discovery, and the URI layer to React.

## `usePillar<P>(p)`

Return a `CallablePillar<ContractFor<P>>` bound to the active `PillarSdkProvider` options, so a component can call `usePillar('finance').accounts.list()` without re-passing transport/auth.

```ts
export function usePillar<P extends KnownPillarId>(p: P): CallablePillar<ContractFor<P>>;
```

Building blocks that already exist: `CallablePillar<C>` (`libs/sdk/src/capabilities/callable-pillar.ts`), `KnownPillarId` (`libs/sdk/src/capabilities/known-pillar-id.ts`), `usePillarSdkOptions`, and the `pillar(pillarId, options)` factory. Missing: the `ContractFor<P>` mapping from pillar id to its in-pillar contract type, and the hook wrapper that memoises a `pillar()` handle against the provider options. Today the equivalent is calling `pillar(pillarId, usePillarSdkOptions())` directly.

## `usePillarRegistry()`

Return a `RegistrySnapshot` from context that updates on subscription events.

```ts
export function usePillarRegistry(): RegistrySnapshot;
```

`RegistrySnapshot` and the async `pillarRegistry()` fetcher already exist in `libs/sdk/src/discovery`. The subscription bridge already invalidates caches on `pillar.registered` / `deregistered` / `health-changed` / `snapshot`. Missing: the hook that fetches the snapshot through React Query under a stable key and re-renders when the bridge invalidates it.

## `useUriResolver(uri)`

Resolve a `pops://`-style URI through the registry, async-shaped via Suspense or React Query.

```ts
export function useUriResolver(uri: string): UriResolution | undefined;
```

Entirely unbuilt: there is no `UriResolution` type and no URI-resolver implementation in the SDK. This depends on the shared URI layer (see the `uri-layer` runbook) landing a resolver the hook can wrap.

## Dropped behaviour

The original PRD specified that hooks **throw** `PillarSdkProvider required.` when no provider is mounted. The shipped `usePillarSdkOptions` deliberately returns `{}` instead, so hooks work provider-less against `pillar()` defaults. Any `usePillar`-family hook built later inherits that fallback unless this decision is revisited — if a hard requirement is wanted, add the throw at the hook layer, not in `usePillarSdkOptions` (which CLI/test consumers rely on degrading quietly).

## Acceptance criteria (when built)

- [ ] `usePillar<P>(p)` returns a `CallablePillar<ContractFor<P>>` bound to the active provider options; a `ContractFor<P>` id→contract map exists.
- [ ] `usePillarRegistry()` returns a `RegistrySnapshot` from context and re-renders when the subscription bridge invalidates it.
- [ ] `useUriResolver(uri)` resolves a URI through the registry, is async-shaped (Suspense or React Query), and returns `UriResolution | undefined`; the `UriResolution` type and resolver exist.
- [ ] Provider-missing behaviour for these hooks is decided explicitly (throw vs. `pillar()` defaults) and documented.
