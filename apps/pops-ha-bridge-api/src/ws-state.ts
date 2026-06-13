/**
 * Pure state transitions for the HA WebSocket subscriber.
 *
 * Splitting these out of `ws-subscriber.ts` keeps the subscriber file
 * under the per-file LOC ceiling. Each helper takes the previous
 * connection state + inputs and returns the next state; the
 * subscriber owns the side-effects (timer scheduling, socket close).
 */
import type { ConnectionState } from './ws-subscriber-types.js';

export function transitionToAuthFailed(prev: ConnectionState): ConnectionState {
  const lastEventAt = prev.kind === 'offline' ? prev.lastEventAt : 0;
  return { kind: 'offline', reason: 'auth-failed', lastEventAt };
}

export function transitionToReconnecting(
  prev: ConnectionState,
  nextAttemptInMs: number
): ConnectionState {
  const lastEventAt = prev.kind === 'connected' ? prev.lastEventAt : 0;
  return { kind: 'reconnecting', lastEventAt, nextAttemptInMs };
}

export function isPostAuthFailureClose(prev: ConnectionState): boolean {
  return prev.kind === 'offline' && prev.reason === 'auth-failed';
}
