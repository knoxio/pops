# React SDK

The React-ergonomic surface of `@pops/pillar-sdk`. Wires the cross-pillar client options, the registry SSE stream, and React Query cache invalidation into a single root provider so frontends can call any pillar through React without re-plumbing transport, auth, or discovery on every component.

Published as the `./react` subpath export of `@pops/pillar-sdk` (`libs/sdk/src/react`). Consumed by the shell (`pillars/shell`) and by each `@pops/app-<id>` frontend.

## Surface

```ts
// @pops/pillar-sdk/react

export function PillarSdkProvider(props: PillarSdkProviderProps): ReactNode;
export function usePillarSdkOptions(): PillarClientOptions;

export function pillarQueryKey(
  pillarId: string,
  path: readonly string[],
  input: unknown
): readonly [string, ...string[], string];

export function usePillarSubscriptionBridge(options?: UsePillarSubscriptionBridgeOptions): void;
export function applySubscriptionEvent(client: QueryClient, event: SubscriptionEvent): void;
```

```ts
type PillarSdkProviderProps = {
  options?: PillarClientOptions; // forwarded to every pillar() call
  queryClient?: QueryClient; // when set, nests a QueryClientProvider
  subscribe?: boolean; // mount the SSE bridge (default false)
  subscriptionOptions?: UsePillarSubscriptionBridgeOptions;
  children: ReactNode;
};

type UsePillarSubscriptionBridgeOptions = {
  connect?: SubscriptionConnect; // override the SSE connect factory
  registryUrl?: string; // defaults to the in-cluster registry URL
  enabled?: boolean; // toggle without unmounting
  onError?: (error: unknown) => void; // reconnect/connect failures; defaults to console.warn
};

type SubscriptionEventName =
  | 'pillar.snapshot'
  | 'pillar.registered'
  | 'pillar.deregistered'
  | 'pillar.health-changed';
```

`PillarClientOptions` (transport, `cacheTtlMs`, `callTimeoutMs`, `fetchImpl`, `authHeaders`, `contractVersion`, `registry`) is re-used verbatim from `@pops/pillar-sdk/client` — the provider does not redefine the call surface, it only distributes options.

## Data Model

None. This is a composition/transport layer over the registry and React Query; it owns no persistent state.

## Provider

`PillarSdkProvider` is the single root wiring point:

- **Options distribution.** Memoises `options` (defaulting to `{}`) into a React context. Any hook that needs to build a `pillar()` client reads them via `usePillarSdkOptions`, so transport, auth headers, contract version, and registry config are configured once at the root rather than threaded through props.
- **Query client layering.** The provider is intentionally lightweight. If a `queryClient` is passed, it nests a `QueryClientProvider` for convenience; otherwise it composes cleanly under an existing one. The shell mounts its own `QueryClientProvider` (with custom `QueryCache`/`MutationCache`) above `PillarSdkProvider` and passes no `queryClient`.
- **SSE bridge.** When `subscribe` is `true`, the provider mounts `usePillarSubscriptionBridge` (forwarding `subscriptionOptions`). Off by default so tests stay deterministic and non-browser consumers do not open sockets.

### `usePillarSdkOptions`

Returns the closest provider's `PillarClientOptions`, or an empty object `{}` when no provider is mounted. **It does not throw on a missing provider** — hooks degrade to `pillar()`'s built-in defaults (shared discovery cache, global `fetch`, no auth headers). This is a deliberate deviation from the original "hooks throw `PillarSdkProvider required.`" design: the empty-options fallback keeps the SDK usable in CLI/test contexts without a provider.

## Cache Key

`pillarQueryKey(pillarId, path, input)` produces a stable React Query key of shape `[pillarId, ...path, stableInputKey]`. The input key is a canonical JSON serialisation with object keys sorted recursively, so two structurally-equal inputs collide regardless of key insertion order; `undefined` inputs (and `undefined`-valued properties) collapse to `null` / are dropped. Pure function, no internal state. The leading `pillarId` segment is what the subscription bridge targets when invalidating.

## SSE → Cache Invalidation Bridge

`usePillarSubscriptionBridge` opens the registry event stream (`GET /registry/subscribe`, served by `pillars/registry`) and keeps the React Query cache fresh when registry state changes server-side. It is opt-in: the provider mounts it only under `subscribe`, but it is exported standalone so a consumer can mount it behind its own feature flag.

It relies on the discovery layer's reconnecting subscription (`startReconnectingSubscription`) for the retry schedule, and on a default `EventSource`-backed connect that can be swapped via `connect` (tests inject a synchronous fake). On `EventSource` error it closes the underlying connection so the reconnect owner does not race a second socket. Malformed event payloads are swallowed (dropped) without firing `onError`.

`applySubscriptionEvent` is the pure routing function (exported for tests). Invalidation rules:

| Event                   | Action                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pillar.registered`     | Invalidate the `['<pillarId>']` query-key prefix.                                                                                                   |
| `pillar.deregistered`   | Invalidate the `['<pillarId>']` query-key prefix.                                                                                                   |
| `pillar.health-changed` | Invalidate the `['<pillarId>']` query-key prefix.                                                                                                   |
| `pillar.snapshot`       | Invalidate **every** cache entry whose first key segment is in the snapshot **or** looks like a pillar id (`/^[a-z][a-z0-9-]*$/`). Sent on connect. |

The `pillar.snapshot` rule deliberately over-invalidates: on reconnect the bridge cannot know which pillars deregistered during the gap, so it refetches all pillar-prefixed entries rather than only snapshot members. False positives just refetch; false negatives would leave stale data after a mid-gap deregistration, which is the case being defended against. A snapshot/registered event for a pillar that is gone returns `unavailable` from `pillar()` on the next fetch.

## Edge Cases

| Case                         | Behaviour                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Provider missing             | `usePillarSdkOptions` returns `{}`; hooks fall back to `pillar()` defaults. No throw.                                      |
| `queryClient` passed         | Provider nests a `QueryClientProvider` bound to it.                                                                        |
| `queryClient` omitted        | Provider composes under the host's existing `QueryClientProvider` (the shell case); hooks read the nearest client.         |
| `subscribe` false (default)  | No SSE socket opened; cache invalidation is manual/host-driven.                                                            |
| Pillar registered mid-render | The SSE `pillar.registered` event invalidates the matching `['<pillarId>']` prefix; React Query refetches on next access.  |
| Reconnect after gap          | `pillar.snapshot` over-invalidates all pillar-prefixed entries so deregistered-during-gap pillars cannot serve stale data. |
| Malformed SSE payload        | Dropped silently; `onError` is not fired (it covers connect/reconnect failures only).                                      |
| `EventSource` unavailable    | The default connect throws; pass a custom `connect` for non-browser runtimes.                                              |

## Acceptance Criteria

- [x] `PillarSdkProvider` is exported from `@pops/pillar-sdk/react` and distributes `PillarClientOptions` through React context.
- [x] When `queryClient` is passed, the provider nests a `QueryClientProvider` bound to it; when omitted, it composes under an existing one.
- [x] `PillarSdkProvider subscribe` mounts `usePillarSubscriptionBridge`; the bridge is off by default.
- [x] `usePillarSdkOptions` returns the configured options, and `{}` when no provider is mounted (no throw on missing provider).
- [x] `pillarQueryKey` returns a stable `[pillarId, ...path, stableInputKey]` key with recursively key-sorted input serialisation; `undefined` collapses to `null`.
- [x] `usePillarSubscriptionBridge` opens `GET /registry/subscribe`, routes frames through `applySubscriptionEvent`, reconnects via `startReconnectingSubscription`, and cleans up on unmount.
- [x] `applySubscriptionEvent` invalidates the `['<pillarId>']` prefix for `registered` / `deregistered` / `health-changed`, and over-invalidates all pillar-prefixed entries for `snapshot`.
- [x] The bridge `connect` factory is overridable; malformed payloads are dropped without firing `onError`.
- [x] The shell mounts `PillarSdkProvider` at the app root and consumes `usePillarSdkOptions` in its settings hooks.

## Out of Scope

- Contract-shaped React hooks (`usePillar`, `usePillarRegistry`, `useUriResolver`) and the `UriResolution` type — see [docs/ideas/react-sdk.md](../../../../ideas/react-sdk.md).
- The `PillarGuard` rewrite.
- Codegen of contract bindings / the dispatcher generator.

## References

- Area: SDK (`@pops/pillar-sdk`) — see the [Federation theme](../../README.md)
- Client surface: `@pops/pillar-sdk/client` (`pillar()`, `PillarClientOptions`, `CallablePillar`)
- Discovery surface: `@pops/pillar-sdk/discovery` (`pillarRegistry()`, `RegistrySnapshot`)
- Registry SSE: `pillars/registry` (`GET /registry/subscribe`)
