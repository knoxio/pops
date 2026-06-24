# Caching + invalidation

> Theme: [Federation](../../README.md)

Bridge the registry's SSE event stream to React Query's cache so a shell — or any
React consumer of `@pops/pillar-sdk` — auto-refreshes when a pillar's
registration changes (registers, deregisters, or flips health). Ships in the
SDK's `react` entrypoint alongside the provider and the cache-key factory.

No new data and no new REST surface: this orchestrates existing caches over an
existing read-only stream.

## Surface

All exports live at `@pops/pillar-sdk/react`.

```ts
export function PillarSdkProvider(props: PillarSdkProviderProps): ReactNode;

export type PillarSdkProviderProps = {
  options?: PillarClientOptions; // forwarded to every pillar() call
  queryClient?: QueryClient; // optional; nests QueryClientProvider when set
  subscribe?: boolean; // default false — opt in to the SSE bridge
  subscriptionOptions?: UsePillarSubscriptionBridgeOptions;
  children: ReactNode;
};

export function usePillarSdkOptions(): PillarClientOptions;

export function pillarQueryKey(
  pillarId: string,
  path: readonly string[],
  input: unknown
): readonly [string, ...string[], string];

export function usePillarSubscriptionBridge(options?: UsePillarSubscriptionBridgeOptions): void;

export function applySubscriptionEvent(client: QueryClient, event: SubscriptionEvent): void;
```

### Cache key shape

`pillarQueryKey` is the single source of truth for React Query keys:

```
[pillarId, ...path, stableInputKey]
```

`stableInputKey` is `JSON.stringify` of the input with object keys sorted
recursively, so two structurally-equal inputs (regardless of key insertion
order) collapse to one cache entry. `undefined` input serialises to `"null"`.
The pure function takes inputs to key with no internal state.

The first segment is always the `pillarId`. That invariant is what makes
prefix-based invalidation work: invalidating `[pillarId]` reaches every query
nested under it.

### Provider layering

`PillarSdkProvider` wires `options` into React context for the data hooks to
read, and conditionally mounts the SSE bridge:

- Pass `queryClient` → it nests a `QueryClientProvider` for convenience.
- Omit `queryClient` → it composes under a host-owned `QueryClientProvider`
  further up the tree (the common case inside the shell, which owns its own
  query client). The hooks read whichever `QueryClient` is closest.
- `subscribe` defaults to `false`. Tests stay deterministic and CLI consumers
  never open a socket unless they opt in. When `true`, the provider mounts
  `usePillarSubscriptionBridge` with `subscriptionOptions`.

## Event → invalidation contract

The bridge consumes the registry's `GET /registry/subscribe` SSE stream
(served by the `registry` pillar at `http://registry-api:3001`). The registry
emits frames named `pillar.<event>`:

| Wire event              | Sent when                                | Payload                                   |
| ----------------------- | ---------------------------------------- | ----------------------------------------- |
| `pillar.snapshot`       | Once, on connect                         | `RegistryEntry[]` (current registrations) |
| `pillar.registered`     | A pillar registers (manifest in payload) | `{ pillarId, entry, emittedAt, ... }`     |
| `pillar.deregistered`   | A pillar deregisters or is evicted       | `{ pillarId, entry, reason, ... }`        |
| `pillar.health-changed` | Heartbeat status transition              | `{ pillarId, entry, emittedAt, ... }`     |

`applySubscriptionEvent` is the pure routing function (exported for tests):

| Event                                                                 | Invalidation                                                                                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pillar.registered` / `pillar.deregistered` / `pillar.health-changed` | `invalidateQueries({ queryKey: [pillarId] })` — the whole prefix                                                                          |
| `pillar.snapshot`                                                     | `invalidateQueries` with a predicate over every cache entry whose first segment is a snapshot member **or** matches the pillar-id pattern |

A registered/deregistered/health-changed frame with no string `pillarId` in its
payload is a no-op (malformed frames are dropped, not thrown).

### Snapshot is deliberately broad

On reconnect the bridge does **not** know which pillars deregistered during the
SSE gap. So the snapshot handler invalidates **every** cache entry whose first
key segment looks like a pillar id — not only the snapshot members. Matching is
the lowercase-kebab heuristic `/^[a-z][a-z0-9-]*$/` (the manifest pillar-id
constraint). A non-matching first segment (e.g. `SystemMetrics`, uppercase) is
left alone. Snapshot pillars then refetch from a fresh source of truth; a pillar
that vanished during the gap returns `unavailable` on its next call. Targeting
only snapshot members would leave stale data for pillars that left mid-gap.

False positives from the heuristic are harmless (an extra refetch); false
negatives would leak stale data, so the rule errs broad.

## Connection lifecycle

- `usePillarSubscriptionBridge` opens the stream through the SDK's
  `startReconnectingSubscription` (`@pops/pillar-sdk` discovery), which owns the
  reconnect schedule and backoff.
- Default transport is an `EventSource` against
  `${registryUrl}/registry/subscribe`. `registryUrl` defaults to
  `DEFAULT_REGISTRY_URL` (`http://registry-api:3001`). Consumers can inject a
  `connect` factory — tests drive events synchronously through a fake source.
- The default `EventSource` adapter closes the underlying connection on the
  first `error` and hands the reconnect decision to
  `startReconnectingSubscription`, so the library's retry never races
  `EventSource`'s built-in one.
- On unmount the bridge stops the subscription and removes its event listeners;
  no further invalidations fire.
- `enabled: false` disables the bridge without unmounting (no `connect` call).
- Reconnect/connection failures bubble to `onError` (defaults to `console.warn`).
  Malformed event payloads are swallowed silently and do not fire `onError`.

## Rules

- **One provider at the React tree root**, composing with the host's
  `QueryClientProvider`.
- **Invalidation cascades by prefix.** Invalidating `[pillarId]` invalidates
  every query under that pillar.
- **Active queries refetch; idle queries lazy-refetch on next mount.** Inherited
  from React Query's default invalidation semantics — not overridden here.
- **In-flight queries are never cancelled.** `invalidateQueries` is called
  without `cancelRefetch: true`, so any in-flight fetch completes and the next
  render uses fresh data.

## Edge cases

| Case                                                  | Behaviour                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar flaps healthy → unavailable → healthy in <1s   | Two invalidation cycles (one `invalidateQueries` per frame). React Query's observer dedup applies unchanged.                                                                 |
| Many simultaneous events                              | One `invalidateQueries` call per frame; React Query batches internally.                                                                                                      |
| Subscription drops mid-session                        | `startReconnectingSubscription` reconnects; the reconnect snapshot invalidates every pillar-prefixed entry, defending against a deregistration that happened during the gap. |
| First segment is not a pillar id (e.g. uppercase key) | Left untouched by `pillar.snapshot`.                                                                                                                                         |

## Acceptance criteria

- [x] `PillarSdkProvider` exists at `@pops/pillar-sdk/react` and composes with a
      host `QueryClientProvider`; nests one only when `queryClient` is passed.
- [x] Provider subscribes to the registry SSE stream **only** when `subscribe` is
      set (default off), via `usePillarSubscriptionBridge`.
- [x] `pillarQueryKey` produces `[pillarId, ...path, stableInputKey]` with
      order-independent input serialisation.
- [x] `pillar.registered` / `pillar.deregistered` / `pillar.health-changed`
      invalidate the `[pillarId]` prefix; malformed payloads are no-ops.
- [x] `pillar.snapshot` invalidates every cache entry whose first segment is a
      snapshot member or matches the pillar-id heuristic — including pillars
      absent from the snapshot (deregistered-during-gap defense).
- [x] Non-pillar-id first segments are not invalidated by `pillar.snapshot`.
- [x] Invalidation cascades by prefix across nested queries.
- [x] In-flight queries are not cancelled (`invalidateQueries` without
      `cancelRefetch`).
- [x] Flapping pillar → one invalidation per frame; many simultaneous events →
      one call each, React Query batches.
- [x] Bridge stops dispatching invalidations after unmount and closes the source;
      `enabled: false` never opens a connection.
- [x] `PillarSdkProvider subscribe` mounts the bridge; without it the bridge stays
      unmounted.
- [x] Tests cover event-arrives → query invalidated for all four events, plus the
      snapshot-gap defense, malformed-payload drop, unmount cleanup, and the
      provider `subscribe` prop (jsdom suite).

## Out of scope

- Custom cache eviction policies.
- Persistent (localStorage) cache layer.
- Multi-tenant cache isolation.
- A consumer-side "pillar unavailable" fallback surface. The bridge only
  invalidates; whether a query renders a fallback is the consumer's concern —
  each pillar app derives `unavailable` from its own `*-api-helpers`
  (`isUnavailableError` on a 5xx / no-status response). See
  [the idea file](../../../../ideas/caching-invalidation.md) for the
  unbuilt failure-flag integration.
