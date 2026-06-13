/**
 * Inbound HA frame routing for the WebSocket subscriber.
 *
 * Houses the per-frame-type handlers (auth, snapshot, call_service
 * result, state-changed event) as pure-ish free functions that operate
 * on a small `InboundContext` slice of the subscriber. Kept here so
 * `ws-subscriber.ts` stays under the per-file LOC ceiling and the
 * frame router can be evolved without touching the connection-state
 * machine.
 */
import { upsertEntity } from '@pops/ha-bridge-db';

import { stateObjectToMirrorInput, type HaFrame, type HaStateObject } from './ha-frame.js';

import type { OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import type { CallServiceSender } from './ai-tools/call-service-sender.js';
import type { HistoryDebouncer } from './history-debouncer.js';
import type { FireEventSender } from './sinks/fire-event-sender.js';
import type { ConnectionState } from './ws-subscriber-types.js';

export interface InboundContext {
  readonly db: OpenedHaBridgeDb;
  readonly token: string | undefined;
  readonly now: () => number;
  readonly debouncer: HistoryDebouncer;
  readonly fireEventSender: FireEventSender;
  readonly callServiceSender: CallServiceSender;
  send(data: string): void;
  sendCommand(payload: Record<string, unknown>): void;
  setConnectionState(state: ConnectionState): void;
  onAuthOk(): void;
  onAuthInvalid(): void;
  isSubscribed(): boolean;
  markSubscribed(): void;
}

export function handleCallServiceResultFrame(ctx: InboundContext, frame: HaFrame): boolean {
  if (frame.type !== 'result' || frame.id === undefined) return false;
  return ctx.callServiceSender.handleResult({
    id: frame.id,
    success: frame.success === true,
    error: frame.error,
  });
}

export function handleAuthFrame(ctx: InboundContext, frame: HaFrame): boolean {
  if (frame.type === 'auth_required') {
    ctx.send(JSON.stringify({ type: 'auth', access_token: ctx.token }));
    return true;
  }
  if (frame.type === 'auth_invalid') {
    ctx.onAuthInvalid();
    return true;
  }
  if (frame.type === 'auth_ok') {
    ctx.setConnectionState({ kind: 'connected', lastEventAt: ctx.now() });
    ctx.onAuthOk();
    ctx.sendCommand({ type: 'get_states' });
    return true;
  }
  return false;
}

export function handleSnapshotFrame(ctx: InboundContext, frame: HaFrame): boolean {
  if (frame.type !== 'result' || frame.success !== true || !Array.isArray(frame.result)) {
    return false;
  }
  for (const state of frame.result as HaStateObject[]) {
    const input = stateObjectToMirrorInput(state, ctx.now());
    if (input !== undefined) upsertEntity(ctx.db.db, input);
  }
  if (!ctx.isSubscribed()) {
    ctx.markSubscribed();
    ctx.sendCommand({ type: 'subscribe_events', event_type: 'state_changed' });
    ctx.fireEventSender.flush();
  }
  return true;
}

export function handleEventFrame(ctx: InboundContext, frame: HaFrame): void {
  if (frame.type !== 'event' || frame.event?.event_type !== 'state_changed') return;
  const newState = frame.event.data?.new_state;
  if (newState === undefined || newState === null) return;
  const now = ctx.now();
  const input = stateObjectToMirrorInput(newState, now);
  if (input === undefined) return;
  upsertEntity(ctx.db.db, input);
  ctx.setConnectionState({ kind: 'connected', lastEventAt: now });
  ctx.debouncer.observe({
    entityId: input.entityId,
    state: input.state,
    attributes: input.attributes,
    observedAt: input.lastChanged,
  });
}
