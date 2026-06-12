# PRD-163: Subscription model

> Epic: [Central registry](../../epics/02-central-registry.md)

## Overview

Server-Sent Events (SSE) channel served by `pops-core-api` that streams registry state changes to subscribers. The first event after connection is the full `RegistrySnapshot`; subsequent events are incremental — `registered`, `deregistered`, `health-changed`, `manifest-updated`. On reconnect, the snapshot-then-incremental cycle repeats. Subscribers do not need to track sequence numbers or request backlogs.

Client-side filtering: every subscriber gets every event. Bandwidth is negligible at the scale we operate (≤10 pillars, ≤5 subscribers). Server stays simple.

This PRD ships the SSE endpoint, the event schema, and the reconnect-friendly catch-up. PRD-161 emits events from mutating procedures; PRD-162 emits events from the health ticker; PRD-163 turns those into wire format and delivers them.

## Data Model

### Event schema

```ts
// @pops/pillar-sdk/registry-events

import type { ManifestPayload } from '../manifest-schema';
import type { RegistrySnapshot } from '../discovery';

export type RegistryEvent =
  | {
      type: 'snapshot';
      snapshot: RegistrySnapshot;
      emittedAt: string; // ISO8601
    }
  | {
      type: 'registered';
      pillarId: string;
      manifest: ManifestPayload;
      baseUrl: string;
      emittedAt: string;
    }
  | {
      type: 'deregistered';
      pillarId: string;
      emittedAt: string;
    }
  | {
      type: 'health-changed';
      pillarId: string;
      previousStatus: 'healthy' | 'unavailable' | 'unknown';
      status: 'healthy' | 'unavailable' | 'unknown';
      emittedAt: string;
    }
  | {
      type: 'manifest-updated';
      pillarId: string;
      manifest: ManifestPayload;
      emittedAt: string;
    };
```

### SSE wire format

Each event is a single `data:` line. The SSE `event:` field carries the discriminant:

```
event: snapshot
data: {"type":"snapshot","snapshot":{...},"emittedAt":"2026-06-12T03:04:05.123Z"}

event: registered
data: {"type":"registered","pillarId":"finance","manifest":{...},"baseUrl":"http://finance-api:3004","emittedAt":"2026-06-12T03:04:10.456Z"}

event: health-changed
data: {"type":"health-changed","pillarId":"media","previousStatus":"healthy","status":"unavailable","emittedAt":"2026-06-12T03:04:42.789Z"}
```

Keep-alive comments (`: keepalive\n\n`) every 30s prevent proxies from killing idle streams.

### Internal event bus

```ts
// @pops/core-api/registry/event-bus.ts

import EventEmitter from 'node:events';

const eventBus = new EventEmitter();

export function emitRegistryEvent(event: Omit<RegistryEvent, 'emittedAt'>): void {
  const wireEvent = { ...event, emittedAt: new Date().toISOString() };
  eventBus.emit('event', wireEvent);
}

export function subscribeToEvents(callback: (event: RegistryEvent) => void): () => void {
  eventBus.on('event', callback);
  return () => eventBus.off('event', callback);
}
```

PRD-161's mutating procedures + PRD-162's ticker call `emitRegistryEvent`. The SSE endpoint subscribes via `subscribeToEvents` and writes each event to its open response stream.

## API Surface

### `GET /trpc/core.registry.subscribe` (or `/registry/subscribe` — see Business Rules)

Hand-rolled SSE response (NOT a tRPC subscription, because tRPC's subscription transport requires WebSocket). Endpoint lives directly on the Express app, alongside the tRPC router.

Response:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `X-Accel-Buffering: no` (disables nginx response buffering)
- `Connection: keep-alive`

Lifecycle:

1. On request open: immediately write a `snapshot` event with the current registry state (one query against `pillar_registry`).
2. Subscribe the connection to the in-memory event bus.
3. Forward every event to the response stream.
4. Every 30s, write a keep-alive comment (`: keepalive\n\n`).
5. On request close: unsubscribe from the event bus.

### Client side (SDK helper)

```ts
// @pops/pillar-sdk/registry-subscription

export type SubscriptionHandle = {
  close: () => void;
  isConnected: () => boolean;
};

export function subscribeToRegistry(
  url: string,
  handlers: {
    onSnapshot?: (snapshot: RegistrySnapshot) => void;
    onRegistered?: (event: Extract<RegistryEvent, { type: 'registered' }>) => void;
    onDeregistered?: (event: Extract<RegistryEvent, { type: 'deregistered' }>) => void;
    onHealthChanged?: (event: Extract<RegistryEvent, { type: 'health-changed' }>) => void;
    onManifestUpdated?: (event: Extract<RegistryEvent, { type: 'manifest-updated' }>) => void;
    onConnect?: () => void;
    onDisconnect?: (reason: 'normal' | 'error', err?: Error) => void;
  },
  options?: {
    /** Reconnect backoff: 1s, 2s, 4s, ..., capped at 30s. */
    reconnectMaxMs?: number;
  }
): SubscriptionHandle;
```

Server-side consumers (e.g. PRD-159's discovery cache) use this helper to listen for invalidation events.

## Business Rules

- **The first event is always `snapshot`.** Sent immediately on connect AND immediately after every reconnect. Subscribers can rely on it; they don't need to call `snapshot` separately.
- **Subsequent events are incremental.** Each describes one change (one pillar's transition, one registration, etc.). Subscribers update local state per event.
- **No event filtering server-side.** Every subscriber receives every event. Bandwidth is acceptable; complexity savings are worth it.
- **Keep-alive every 30 seconds.** Standard SSE pattern; prevents intermediaries from declaring the stream idle and closing it.
- **`X-Accel-Buffering: no` is essential.** Without it, nginx (or any reverse proxy) buffers response chunks and consumers see events in batches. The header disables buffering.
- **The endpoint is NOT mounted under the tRPC router.** tRPC subscriptions require WebSocket transport; SSE is plain HTTP. The endpoint sits alongside tRPC at `/registry/subscribe` on the Express app.
- **`/registry/subscribe` is exposed externally** (read-only data; useful for debug + ops dashboards). The nginx dispatcher rule in PRD-161 us-08 allows it through alongside `/trpc/core.registry.snapshot`.
- **Reconnect uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...** Capped at 30s. The client SDK retries indefinitely; consumers can opt out via `close()`.
- **Reconnect emits an `onDisconnect('error')` then an `onConnect` + fresh `onSnapshot`.** Consumers can compare the new snapshot to their local state and reconcile (PRD-159's discovery cache uses this).
- **Per-subscription queue is unbounded but lightly used.** Each subscriber has its own write queue in the Express response stream. SQLite is the bottleneck; the event bus itself is in-process and trivial.
- **No event sequence numbers.** Catch-up is via snapshot-on-reconnect, not via backlog replay.
- **No event deduplication across reconnects.** A consumer that disconnects mid-event might miss the in-flight one; the snapshot-on-reconnect makes this self-healing.
- **Event emission order matches mutation order.** The `EventEmitter` is synchronous; events emit in the order their procedures complete.
- **Manifest updates emit a single event.** If a pillar re-registers with a different manifest (e.g. new procedure added), one `manifest-updated` event fires after the underlying register. Tests can rely on this.
- **The internal event bus is a singleton per core-api process.** Multi-process scaling is out of scope; if core-api ever horizontal-scales, the bus needs Redis pub/sub or similar — separate concern.

## Edge Cases

| Case                                                                                        | Behaviour                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subscriber connects; no pillars registered yet                                              | First event is a snapshot with `pillars: []`. Subscriber starts listening for `registered` events.                                                                                                 |
| Subscriber disconnects mid-event                                                            | The in-flight write fails; Express response stream errors; subscription is cleaned up; next reconnect gets a fresh snapshot.                                                                       |
| 10 events fire while subscriber is mid-reconnect                                            | The events are NOT buffered for replay (no sequence numbers). The fresh snapshot-on-reconnect contains the new state; subscriber reconciles. Acceptable loss of granular intermediate events.      |
| Subscriber is very slow (writes block)                                                      | Express stream backpressure causes the write to be queued. If the queue grows unbounded, Node's default high-water mark causes errors; in practice, with one event per few seconds, this is fine.  |
| Many subscribers (10+)                                                                      | Each gets its own event stream. The in-process `EventEmitter` fans out cheaply. No load issues at this scale.                                                                                      |
| Core-api restarts                                                                           | All subscriber connections close (HTTP keep-alive terminated). Subscribers reconnect; get fresh snapshot. Some may see brief gaps where their local state is out of date until reconnect succeeds. |
| nginx times out the SSE connection                                                          | The `keepalive` comments every 30s prevent this in practice. If a misconfigured proxy still times out, consumer reconnects per its backoff.                                                        |
| Subscriber expects events in a specific order                                               | Events fire in mutation-completion order; tests rely on this.                                                                                                                                      |
| Two pillars register in the same millisecond                                                | Two `registered` events fire in the order their transactions completed. SQLite serialises writes; the order is deterministic per process.                                                          |
| Event payload contains characters that break SSE framing (e.g. `\n\n` in a manifest string) | JSON encoding sanitises this; manifests don't contain raw newlines after JSON.stringify. Safe.                                                                                                     |
| Subscriber implements `onSnapshot` but not `onHealthChanged`                                | Health-changed events arrive but trigger no handler; SDK silently no-ops. Subscriber can rebuild state from the next snapshot reconnect.                                                           |
| Server-side bug emits a malformed event                                                     | Subscriber's parse fails (JSON.parse error); SDK logs the error and continues. The bus doesn't crash.                                                                                              |
| Subscription endpoint receives a non-GET request                                            | Returns 405 Method Not Allowed.                                                                                                                                                                    |
| Subscriber sends `Last-Event-ID` header (standard SSE feature)                              | Ignored. No sequence numbers; the snapshot-on-connect handles catch-up.                                                                                                                            |

## User Stories

| #   | Story                                                                     | Summary                                                                                                                 | Parallelisable                                   |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 01  | [us-01-event-bus](us-01-event-bus.md)                                     | `emitRegistryEvent` + `subscribeToEvents` in-process EventEmitter; types                                                | yes — independent                                |
| 02  | [us-02-sse-endpoint](us-02-sse-endpoint.md)                               | `GET /registry/subscribe` Express handler; SSE response framing; keep-alive                                             | blocked by us-01                                 |
| 03  | [us-03-snapshot-on-connect](us-03-snapshot-on-connect.md)                 | First event after connection is a fresh `snapshot` event; subsequent events stream incremental                          | blocked by us-02                                 |
| 04  | [us-04-emission-wiring](us-04-emission-wiring.md)                         | PRD-161's mutating procedures + PRD-162's ticker call `emitRegistryEvent`; remove the placeholder stubs from those PRDs | blocked by us-01 + PRD-161 us-07 + PRD-162 us-02 |
| 05  | [us-05-client-sdk-subscribe](us-05-client-sdk-subscribe.md)               | `subscribeToRegistry(url, handlers, opts)` helper with auto-reconnect + backoff                                         | blocked by us-03                                 |
| 06  | [us-06-nginx-allow](us-06-nginx-allow.md)                                 | Confirm `/registry/subscribe` is allowed through the nginx dispatcher (and `X-Accel-Buffering: no` is honoured)         | yes — independent                                |
| 07  | [us-07-discovery-cache-integration](us-07-discovery-cache-integration.md) | PRD-159's discovery cache uses the SDK helper to invalidate on `registered`/`deregistered`/`health-changed` events      | blocked by us-05 + PRD-159 us-03                 |
| 08  | [us-08-integration-tests](us-08-integration-tests.md)                     | Spin up core-api, connect a subscriber, register a pillar, verify event order matches mutation order                    | blocked by us-04 + us-05                         |
| 09  | [us-09-reconnect-tests](us-09-reconnect-tests.md)                         | Kill core-api mid-stream; verify client reconnects with backoff; new snapshot arrives                                   | blocked by us-05                                 |
| 10  | [us-10-author-docs](us-10-author-docs.md)                                 | Documentation: when to subscribe vs. poll; event ordering guarantees; reconnect semantics                               | yes — independent                                |

## Out of Scope

- WebSocket transport. SSE is enough; tRPC subscriptions are not used here.
- Sequence numbers / backlog replay. Snapshot-on-reconnect makes this unnecessary.
- Server-side event filtering. Client-side filtering is fine at this scale.
- Per-subscriber backpressure semantics. Node's default high-water marks handle it.
- Cross-process event distribution (Redis pub/sub, NATS). Single-process EventEmitter; revisit if horizontal scaling happens.
- Authentication on the SSE endpoint. Public read; consistent with PRD-161's nginx allow-list.
- Event compression (Brotli, gzip). Tiny payloads; not worth the CPU.
- Webhooks (push events to external URLs). SSE pull-only.
- TLS / mTLS. The docker network is the trust boundary.
- Custom event types beyond the four listed. Adding types is an additive contract change to the SDK + a coordinated rollout.
- Event persistence (e.g. log every event to a file). The bus is volatile; if an audit log is needed, write it from the emitter call sites.
- Browser EventSource polyfills. Modern browsers support SSE natively; older support is out of scope.
- Heartbeat events on the SSE channel (separate from pillar heartbeats). The keep-alive comment serves this purpose at the SSE protocol level.
