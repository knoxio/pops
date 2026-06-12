/**
 * SSE → React Query cache invalidation bridge (Theme 13 PRD-194).
 *
 * Reuses PRD-163's `GET /registry/subscribe` event stream and PRD-164's
 * `startReconnectingSubscription` to keep the React Query cache fresh
 * when registry state changes server-side.
 *
 * Invalidation rules:
 *
 *   pillar.registered    → invalidate ['<pillarId>'] prefix
 *   pillar.deregistered  → invalidate ['<pillarId>'] prefix
 *   pillar.health-changed→ invalidate ['<pillarId>'] prefix
 *   pillar.snapshot      → invalidate every cache entry whose first key
 *                          segment is a `pillarId` present in the snapshot
 *
 * The bridge is opt-in. `PillarSdkProvider` mounts it only when
 * `subscribe` is true; tests default to off to stay deterministic.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { startReconnectingSubscription, type SubscriptionHandle } from '../discovery/reconnect.js';

import type { QueryClient } from '@tanstack/react-query';

/**
 * Event names emitted by `GET /registry/subscribe`. `pillar.snapshot` is
 * sent once on connect; the other three correspond to registry
 * mutations (see `apps/pops-core-api/src/modules/registry/event-bus.ts`).
 */
export type SubscriptionEventName =
  | 'pillar.snapshot'
  | 'pillar.registered'
  | 'pillar.deregistered'
  | 'pillar.health-changed';

export interface SubscriptionEvent {
  readonly event: SubscriptionEventName;
  readonly data: unknown;
}

/**
 * Minimal SSE-shaped source the bridge consumes. Production uses a thin
 * `EventSource` adapter; tests inject a fake to drive events
 * synchronously.
 */
export interface SubscriptionSource extends SubscriptionHandle {
  readonly onEvent: (listener: (event: SubscriptionEvent) => void) => () => void;
}

export type SubscriptionConnect = () => Promise<SubscriptionSource> | SubscriptionSource;

const DEFAULT_REGISTRY_URL = 'http://core-api:3001';
const SUBSCRIBE_PATH = '/registry/subscribe';

const TRACKED_EVENTS: readonly SubscriptionEventName[] = [
  'pillar.snapshot',
  'pillar.registered',
  'pillar.deregistered',
  'pillar.health-changed',
];

export interface UsePillarSubscriptionBridgeOptions {
  /**
   * Override the SSE connect factory. When omitted the bridge opens an
   * `EventSource` against `${registryUrl}${SUBSCRIBE_PATH}`.
   */
  readonly connect?: SubscriptionConnect;
  /** Registry base URL. Defaults to the in-cluster core-api URL. */
  readonly registryUrl?: string;
  /** Disable the bridge without unmounting the component. */
  readonly enabled?: boolean;
  /** Bubble up reconnect / parse failures. Optional — defaults to console.warn. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Hook that opens the registry SSE stream and routes each frame to
 * `applySubscriptionEvent`. Cleans up on unmount.
 *
 * Intentionally exported so consumers can mount the bridge themselves —
 * e.g. behind a feature flag — without going through
 * `<PillarSdkProvider subscribe>`.
 */
export function usePillarSubscriptionBridge(
  options: UsePillarSubscriptionBridgeOptions = {}
): void {
  const queryClient = useQueryClient();
  const {
    connect: connectOverride,
    registryUrl = DEFAULT_REGISTRY_URL,
    enabled = true,
    onError,
  } = options;

  useEffect(() => {
    if (!enabled) return;
    const connect: SubscriptionConnect =
      connectOverride ?? (() => openEventSourceSubscription(registryUrl));

    let cancelled = false;
    const subscription = startReconnectingSubscription({
      connect: async () => {
        const source = await connect();
        const unsubscribeEvents = source.onEvent((event) => {
          if (cancelled) return;
          applySubscriptionEvent(queryClient, event);
        });
        return {
          close: () => {
            unsubscribeEvents();
            source.close();
          },
          onClose: source.onClose,
        };
      },
      fetchSnapshot: () => {
        return undefined;
      },
      onReconnectError: (error: unknown) => {
        reportError(error, onError);
      },
    });

    return () => {
      cancelled = true;
      subscription.stop();
    };
  }, [queryClient, connectOverride, registryUrl, enabled, onError]);
}

/**
 * Pure routing function — exported for tests. Given a subscription
 * event and a `QueryClient`, applies the cache-invalidation rules
 * documented at the top of this file.
 */
export function applySubscriptionEvent(client: QueryClient, event: SubscriptionEvent): void {
  switch (event.event) {
    case 'pillar.registered':
    case 'pillar.deregistered':
    case 'pillar.health-changed': {
      const pillarId = extractPillarId(event.data);
      if (pillarId === null) return;
      void client.invalidateQueries({ queryKey: [pillarId] });
      return;
    }
    case 'pillar.snapshot': {
      const pillarIds = extractSnapshotPillarIds(event.data);
      if (pillarIds.size === 0) return;
      void client.invalidateQueries({
        predicate: (query) => {
          const first = query.queryKey[0];
          return typeof first === 'string' && pillarIds.has(first);
        },
      });
      return;
    }
  }
}

function hasStringPillarId(value: unknown): value is { pillarId: string } {
  if (value === null || typeof value !== 'object') return false;
  const candidate: unknown = Reflect.get(value, 'pillarId');
  return typeof candidate === 'string' && candidate.length > 0;
}

function extractPillarId(data: unknown): string | null {
  return hasStringPillarId(data) ? data.pillarId : null;
}

function extractSnapshotPillarIds(data: unknown): ReadonlySet<string> {
  if (!Array.isArray(data)) return new Set();
  const ids = new Set<string>();
  for (const entry of data) {
    if (hasStringPillarId(entry)) ids.add(entry.pillarId);
  }
  return ids;
}

function reportError(error: unknown, onError?: (error: unknown) => void): void {
  if (onError) {
    onError(error);
    return;
  }
  globalThis.console.warn('[pillar-sdk:subscription-bridge] error', error);
}

/**
 * Default `EventSource`-backed connect. Lives here so the hook stays
 * lean and so callers can replace it wholesale via `connect`.
 */
function openEventSourceSubscription(registryUrl: string): SubscriptionSource {
  const url = `${registryUrl.replace(/\/$/, '')}${SUBSCRIBE_PATH}`;
  const EventSourceCtor = globalThis.EventSource;
  if (typeof EventSourceCtor !== 'function') {
    throw new Error(
      'EventSource is not available in this runtime; pass a custom `connect` to usePillarSubscriptionBridge.'
    );
  }
  const source = new EventSourceCtor(url);
  const closeListeners = new Set<(reason?: unknown) => void>();
  const eventListeners = new Set<(event: SubscriptionEvent) => void>();
  const domListeners: { name: SubscriptionEventName; handler: (e: MessageEvent) => void }[] = [];

  for (const name of TRACKED_EVENTS) {
    const handler = (e: MessageEvent): void => {
      const rawData: unknown = e.data;
      let parsed: unknown = rawData;
      if (typeof rawData === 'string') {
        try {
          parsed = JSON.parse(rawData);
        } catch {
          /* keep raw string */
        }
      }
      for (const listener of eventListeners) listener({ event: name, data: parsed });
    };
    source.addEventListener(name, handler);
    domListeners.push({ name, handler });
  }

  const onSourceError = (): void => {
    for (const listener of closeListeners) listener();
  };
  source.addEventListener('error', onSourceError);

  return {
    close: (): void => {
      for (const { name, handler } of domListeners) {
        source.removeEventListener(name, handler);
      }
      source.removeEventListener('error', onSourceError);
      source.close();
    },
    onClose: (listener) => {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };
}
