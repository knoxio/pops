# Subscription model — deferred extensions

Parts of the original subscription-model spec that the shipped registry SSE stream does not carry. The built surface is documented in [PRD subscription-model](../themes/13-pillar-finale/prds/subscription-model/README.md). These are additive and can land independently.

## `manifest-updated` event

The original spec listed a fourth event type: when a pillar re-registers with a changed manifest (e.g. a new procedure), fire one `manifest-updated` frame after the underlying register so consumers can react to capability changes without diffing snapshots. Today re-registration emits `registered` again with the new `entry`; there is no distinct `manifest-updated` discriminant. Adding it is an additive contract change to the event bus + the client bridge's tracked-event list.

## 30s keep-alive comments

The stream writes no periodic keep-alive comment (`: keepalive\n\n`). Idle streams therefore rely on the client's reconnect backoff to recover if a buffering/timing-out intermediary drops them. A 30s comment loop (cleared on `close`) would keep idle streams alive through proxies that declare silent connections dead. The server code notes this as a deliberate follow-up.

## `405` on non-GET + `Last-Event-ID`

The route only registers a `GET` handler; a non-GET request falls through to the app's default 404 rather than returning `405 Method Not Allowed`. The standard SSE `Last-Event-ID` header is ignored (by design — there are no sequence numbers — but it is neither read nor explicitly rejected). Both are cosmetic correctness items.

## Typed `subscribeToRegistry(url, handlers, opts)` SDK helper

The original spec proposed a high-level SDK helper with per-event callbacks (`onSnapshot`, `onRegistered`, `onDeregistered`, `onHealthChanged`, `onConnect`, `onDisconnect('normal' | 'error')`) and an `isConnected()` handle. The shipped SDK instead exposes a generic reconnect-schedule primitive (`startReconnectingSubscription`) plus a React-Query-specific bridge (`usePillarSubscriptionBridge`). There is no framework-agnostic typed-handler façade. A non-React consumer (e.g. a server-side cache, an ops dashboard) currently has to wire `EventSource` + the reconnect primitive itself. Wrapping that into the proposed handler-based API would close the gap.

## SSE-driven discovery-cache invalidation

The original spec intended the SDK's discovery cache to subscribe to the stream and invalidate on `registered` / `deregistered` / `health-changed`, replacing TTL-based staleness with event-driven freshness. The discovery cache is still TTL-only and does not consume the event stream. Wiring `startReconnectingSubscription` into the discovery cache (so a registry mutation invalidates the cached snapshot immediately) would make discovery push-fresh instead of poll-fresh. Note the React bridge already does event-driven invalidation for the React Query cache — this idea is the analogous treatment for the lower-level discovery snapshot cache.
