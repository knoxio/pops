# Subscription model

> Theme: [Federation](../README.md) · Area: Registry protocol

## Purpose

The `registry` pillar streams its state changes over Server-Sent Events so consumers stay in sync without polling. A subscriber opens `GET /registry/subscribe`, receives the full registry state as the first frame, then receives one incremental frame per change (`registered`, `deregistered`, `health-changed`). On any drop the client reconnects and the snapshot-then-incremental cycle repeats. No sequence numbers, no backlog replay, no server-side filtering — every subscriber gets every event. At the fleet's scale (single-digit pillars, a handful of subscribers) bandwidth is negligible and the server stays a single in-process `EventEmitter`.

The stream is plain HTTP, not part of the ts-rest contract: ts-rest/zod model request/response shapes, not long-lived streams. The route is mounted directly on the Express app alongside the contract surface and the other raw registry routes (register, deregister, snapshot, `/uri/resolve`).

## Data model

### Event bus payload

Mutating registry operations publish to a process-local `EventEmitter` singleton. The published payload:

```ts
type RegistryEventName = 'registered' | 'deregistered' | 'health-changed';
type PillarOriginWire = 'internal' | 'external';
type DeregisterReason = 'requested' | 'never-heartbeated' | 'lost-heartbeat';

interface RegistryEventPayload {
  event: RegistryEventName;
  pillarId: string;
  entry: RegistryEntry | null; // populated on `registered`; null otherwise
  emittedAt: string; // ISO8601, stamped by the bus on emit
  origin?: PillarOriginWire; // pillar origin at emission time
  reason?: DeregisterReason; // populated on `deregistered`
  evictedAt?: string; // populated when the eviction ticker hard-evicts
}
```

`emitRegistryEvent` stamps `emittedAt` and emits; `subscribeToRegistryEvents(listener)` returns an unsubscribe closure. The bus calls `setMaxListeners(0)` so a burst of concurrent subscribers never trips Node's listener-leak warning, and exposes a listener-count probe so tests can assert per-client cleanup.

### Registry entry (snapshot element)

The snapshot frame carries `RegistryEntry[]` — the same shape the discovery snapshot serves:

```ts
interface RegistryEntry {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload;
  contract: { package: string; version: string; tag: string };
  registeredAt: string;
  lastHeartbeatAt: string;
  status: 'healthy' | 'unavailable' | 'unknown';
  statusUpdatedAt: string;
  capabilities?: Record<string, boolean>;
}
```

`status` is computed live from `lastHeartbeatAt` on every read, so the snapshot reflects the freshest state even if the background ticker lags.

## REST surface

### `GET /registry/subscribe`

Hand-rolled SSE response, mounted directly on the Express app (`app.get('/registry/subscribe', …)`) — not via the ts-rest endpoints. Response headers:

| Header              | Value                    | Why                                                                 |
| ------------------- | ------------------------ | ------------------------------------------------------------------- |
| `Content-Type`      | `text/event-stream`      | SSE                                                                 |
| `Cache-Control`     | `no-cache, no-transform` | no intermediary caching/rewriting                                   |
| `Connection`        | `keep-alive`             | hold the stream open                                                |
| `X-Accel-Buffering` | `no`                     | disable reverse-proxy response buffering so frames arrive unbatched |

Lifecycle:

1. On connect, immediately write the snapshot frame — one read against `pillar_registry`, projected to `RegistryEntry[]` with live status.
2. Subscribe the connection to the in-process event bus.
3. Forward every bus payload as a discrete SSE frame.
4. On `req`/`res` `close`, unsubscribe (idempotent — a flaky client cannot leak a bus listener).

### Wire format

Each frame is an `event:` line carrying the discriminant prefixed with `pillar.`, plus a single JSON `data:` line:

```
event: pillar.snapshot
data: [{"pillarId":"finance","baseUrl":"http://finance-api:3004","manifest":{...},"status":"healthy",...}]

event: pillar.registered
data: {"event":"registered","pillarId":"finance","entry":{...},"emittedAt":"2026-06-12T03:04:10.456Z"}

event: pillar.health-changed
data: {"event":"health-changed","pillarId":"media","entry":null,"emittedAt":"2026-06-12T03:04:42.789Z","origin":"external"}
```

The snapshot frame's `data` is a **bare `RegistryEntry[]` array**, not a wrapped envelope. Incremental frames carry the full `RegistryEventPayload`.

### Emission wiring

| Source                                               | Event            | Payload notes                                                                                       |
| ---------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| External register handler                            | `registered`     | `entry` = freshly-projected `RegistryEntry`                                                         |
| External deregister handler                          | `deregistered`   | `entry: null`, `origin`, `reason: 'requested'`                                                      |
| Heartbeat handler (on status transition only)        | `health-changed` | `entry: null`, `origin`                                                                             |
| Eviction ticker (hard-evict of a stale external row) | `deregistered`   | `entry: null`, `origin: 'external'`, `reason: 'never-heartbeated' \| 'lost-heartbeat'`, `evictedAt` |

### Client side — reconnect schedule

A self-healing subscription primitive lives in the SDK (`@pops/pillar-sdk` discovery): `startReconnectingSubscription({ connect, fetchSnapshot, … })`. It does not own the SSE protocol — the caller supplies `connect` (open the stream) and `fetchSnapshot` (refetch once on drop); the primitive owns the schedule. On close it refetches the snapshot once and reconnects with exponential backoff. `computeBackoffDelay(attempt)` yields `initial`, `initial·factor`, … capped at `maxDelayMs`.

Defaults: `RECONNECT_INITIAL_DELAY_MS = 500`, `RECONNECT_BACKOFF_FACTOR = 2`, `RECONNECT_MAX_DELAY_MS = 30_000`. `stop()` halts the loop and closes the active handle.

### Client side — EventSource bridge

The realized SSE consumer is the React Query invalidation bridge (`usePillarSubscriptionBridge`). It opens an `EventSource` against `${registryUrl}/registry/subscribe`, registers listeners for the four tracked event names, JSON-parses each frame, and routes it through `applySubscriptionEvent`:

- `pillar.registered` / `pillar.deregistered` / `pillar.health-changed` → invalidate the `[pillarId]` query-key prefix.
- `pillar.snapshot` → invalidate every cache entry whose first key segment is a present pillar id **or** looks like a pillar id (lowercase-kebab). Broad on purpose: on reconnect the bridge cannot know which pillars were deregistered during the gap, so it cannot leave stale data behind.

The bridge swallows `EventSource`'s built-in retry (closes on `error`) so `startReconnectingSubscription` owns the single reconnect schedule and the two never race. Malformed event payloads are dropped silently; reconnect/connection failures bubble to `onError` (default `console.warn`).

## Rules

- **First frame is always the snapshot.** Sent immediately on connect and after every reconnect. Subscribers never call snapshot separately.
- **Subsequent frames are incremental.** Each describes exactly one change. Subscribers update local state per frame.
- **No server-side filtering.** Every subscriber receives every event.
- **`health-changed` fires only on a real transition.** The heartbeat handler emits only when `statusChanged` is true, not on every heartbeat.
- **Per-client cleanup is mandatory and idempotent.** Both `req` and `res` `close` unsubscribe; the cleanup guards against double-fire. Tests assert the bus listener count returns to baseline after disconnect, including mid-stream kills.
- **The bus is a singleton per process.** No sequence numbers, no cross-process distribution, no persistence. Multi-process scaling would need Redis/NATS pub/sub — explicitly out of scope.
- **Emission order matches mutation order.** The `EventEmitter` is synchronous and SQLite serialises writes, so events fire in the order their transactions complete — deterministic per process.
- **The endpoint is not in the ts-rest contract.** ts-rest models request/response, not streams. The route is a raw Express handler.
- **`/registry/subscribe` is read-only and unauthenticated** (ADR-027: the docker network is the trust boundary; anything able to reach the endpoint is already inside the compose network).
- **`X-Accel-Buffering: no` is required.** Without it a buffering reverse proxy batches frames and consumers see events in clumps.

## Edge cases

| Case                                                             | Behaviour                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subscriber connects, no pillars registered                       | First frame is `pillar.snapshot` with `[]`; subscriber then listens for `registered`.                                                                                                                |
| Subscriber disconnects mid-frame                                 | The in-flight write is a no-op once the stream is ended/closed (`writeFrame` checks `writableEnded`/`closed` and try/catches); the close handler unsubscribes; next reconnect gets a fresh snapshot. |
| Events fire while a subscriber is mid-reconnect                  | Not buffered for replay (no sequence numbers). The fresh snapshot-on-reconnect carries new state; the client reconciles. Granular intermediate events are acceptably lost.                           |
| Many subscribers (10+)                                           | Each gets its own stream; the in-process emitter fans out cheaply; `setMaxListeners(0)` keeps Node quiet. No load issues at this scale.                                                              |
| Registry process restarts                                        | All connections close (keep-alive terminated). Clients reconnect on their backoff and get a fresh snapshot.                                                                                          |
| Reverse proxy times out the idle stream                          | Reconnect on backoff re-establishes the stream. (A periodic keep-alive comment is **not yet implemented** — see the idea note.)                                                                      |
| Two pillars register in the same millisecond                     | Two `registered` frames fire in transaction-completion order; SQLite serialises writes, so the order is deterministic.                                                                               |
| Manifest string contains characters that would break SSE framing | `JSON.stringify` escapes raw newlines, so framing is safe.                                                                                                                                           |
| Subscriber malforms a frame on its end                           | The bridge's `JSON.parse` failure keeps the raw string and the event is dropped without firing `onError`; the bus never crashes.                                                                     |
| EventSource fires `error`                                        | The bridge closes the source (suppressing EventSource's own retry) and signals close; `startReconnectingSubscription` schedules the single reconnect.                                                |

## Acceptance criteria

- [x] `GET /registry/subscribe` is a raw Express route (not a ts-rest endpoint) mounted alongside the contract surface.
- [x] Response sets `text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- [x] The first frame on connect is `event: pillar.snapshot` carrying a bare `RegistryEntry[]` with live-computed status.
- [x] An in-process `EventEmitter` singleton exposes `emitRegistryEvent` (stamps `emittedAt`) and `subscribeToRegistryEvents` (returns unsubscribe), with a listener-count probe and `setMaxListeners(0)`.
- [x] Three event names are emitted — `registered`, `deregistered`, `health-changed` — framed on the wire as `event: pillar.<name>`.
- [x] Register emits `registered` with a populated `entry`; deregister emits `deregistered` with `entry: null`, `origin`, `reason: 'requested'`.
- [x] The heartbeat handler emits `health-changed` only on a real status transition.
- [x] The eviction ticker emits `deregistered` with `reason` (`never-heartbeated` | `lost-heartbeat`) and `evictedAt` when it hard-evicts a stale external row.
- [x] Both `req` and `res` `close` unsubscribe the connection from the bus; cleanup is idempotent and leaves no leaked listeners (asserted for normal disconnect and mid-stream kill).
- [x] The SDK provides a reconnect schedule primitive (`startReconnectingSubscription` + `computeBackoffDelay`) with exponential backoff capped at 30s and a `stop()` control.
- [x] A client SSE consumer opens an `EventSource` against `/registry/subscribe`, parses the four tracked frames, and invalidates the affected query-key prefixes (broad invalidation on snapshot to self-heal mid-gap deregistrations).
- [x] The client bridge swallows EventSource's built-in retry so the reconnect primitive owns the single reconnect schedule; malformed frames are dropped silently.
- [x] Integration tests spin up the registry, connect SSE clients, register a pillar, and assert snapshot-then-`registered` frame ordering and per-client listener cleanup.

## Out of scope

- WebSocket transport. SSE is enough.
- Sequence numbers / backlog replay. Snapshot-on-reconnect makes this unnecessary.
- Server-side event filtering. Client-side is fine at this scale.
- Cross-process event distribution (Redis, NATS). Single-process emitter; revisit only if the registry horizontal-scales.
- Authentication / TLS on the stream. The docker network is the trust boundary.
- Event compression, persistence, webhooks, browser EventSource polyfills.

Deferred extensions that the original spec sketched but the implementation does not (yet) carry — tracked in [docs/ideas/subscription-model.md](../../../ideas/subscription-model.md): the `manifest-updated` event type, 30s keep-alive comments, `405` on non-GET, a typed `subscribeToRegistry(url, handlers, opts)` SDK helper, and SSE-driven invalidation of the discovery cache.
