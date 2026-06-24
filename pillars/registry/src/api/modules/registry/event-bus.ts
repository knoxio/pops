/**
 * In-process registry event bus.
 *
 * Singleton `EventEmitter` that the registry router publishes to on
 * register / deregister / heartbeat status transitions, and that the
 * `GET /registry/subscribe` SSE handler subscribes to.
 *
 * No sequence numbers, no cross-process distribution, no server-side
 * filtering: the bus is a singleton per registry process.
 *
 * Spec: subscription-model.
 */
import { EventEmitter } from 'node:events';

import type { RegistryEntry } from './types.js';

export type RegistryEventName = 'registered' | 'deregistered' | 'health-changed';

/**
 * Deregister reasons. `requested` is a clean shutdown via the
 * external deregister endpoint; the two eviction reasons come from the
 * background ticker that hard-evicts stale external rows.
 */
export type DeregisterReason = 'requested' | 'never-heartbeated' | 'lost-heartbeat';

export type PillarOriginWire = 'internal' | 'external';

export interface RegistryEventPayload {
  event: RegistryEventName;
  pillarId: string;
  entry: RegistryEntry | null;
  emittedAt: string;
  /** Origin of the pillar at emission time. */
  origin?: PillarOriginWire;
  /** Populated on `deregistered` events. */
  reason?: DeregisterReason;
  /** Populated on `deregistered` events from the eviction ticker —
   *  the wall-clock the row was hard-evicted. */
  evictedAt?: string;
}

const EVENT_KEY = 'registry:event' as const;

/**
 * Process-local registry event bus. Exported so tests can probe
 * `listenerCount` to assert per-client cleanup; production callers
 * should go through `emitRegistryEvent` / `subscribeToRegistryEvents`.
 */
export const registryEventBus: EventEmitter = new EventEmitter();
registryEventBus.setMaxListeners(0);

export function emitRegistryEvent(payload: Omit<RegistryEventPayload, 'emittedAt'>): void {
  const enriched: RegistryEventPayload = {
    ...payload,
    emittedAt: new Date().toISOString(),
  };
  registryEventBus.emit(EVENT_KEY, enriched);
}

export function subscribeToRegistryEvents(
  listener: (payload: RegistryEventPayload) => void
): () => void {
  registryEventBus.on(EVENT_KEY, listener);
  return () => {
    registryEventBus.off(EVENT_KEY, listener);
  };
}

export function registryEventListenerCount(): number {
  return registryEventBus.listenerCount(EVENT_KEY);
}
