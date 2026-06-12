/**
 * In-process registry event bus (Theme 13 PRD-163).
 *
 * Singleton `EventEmitter` that the registry router publishes to on
 * register / deregister / heartbeat status transitions, and that the
 * `GET /registry/subscribe` SSE handler subscribes to.
 *
 * Per the PRD: no sequence numbers, no cross-process distribution, no
 * server-side filtering. Multi-process scaling is explicitly out of
 * scope; the bus is a singleton per core-api process.
 */
import { EventEmitter } from 'node:events';

import type { RegistryEntry } from './types.js';

export type RegistryEventName = 'registered' | 'deregistered' | 'health-changed';

export interface RegistryEventPayload {
  event: RegistryEventName;
  pillarId: string;
  entry: RegistryEntry | null;
  emittedAt: string;
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
