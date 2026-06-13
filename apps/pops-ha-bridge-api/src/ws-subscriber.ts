/**
 * Home Assistant WebSocket subscriber (PRD-229 US-01).
 *
 * Subscribes to a Home Assistant instance, completes the auth handshake
 * with the long-lived access token, fetches the full snapshot of states
 * via `get_states`, and subscribes to `state_changed` events. Every event
 * upserts the entity row in `ha_entities`; the per-entity 200ms debounce
 * window batches bursts so only the latest observation lands in
 * `ha_state_history`.
 *
 * Reconnect uses exponential backoff (1s → 2s → 4s → ... → 60s capped).
 * On every reconnect the snapshot pass runs again so missed state during
 * the outage is reconciled rather than silently dropped.
 *
 * The subscriber is implemented around an injectable WebSocket factory
 * so the unit tests can drive the handshake / event stream with a
 * stub instead of standing up a real HA instance.
 *
 * `HA_TOKEN` is never logged, never returned, and never serialised into
 * the manifest — it is only ever passed to the auth frame.
 */
import {
  appendHistory,
  upsertEntity,
  type HaEntityMirrorInput,
  type OpenedHaBridgeDb,
} from '@pops/ha-bridge-db';

import {
  parseFrame,
  stateObjectToMirrorInput,
  type HaFrame,
  type HaStateObject,
} from './ha-frame.js';
import { HistoryDebouncer } from './history-debouncer.js';

import type {
  ConnectionState,
  HaWebSocketFactory,
  HaWebSocketLike,
  HaWebSocketSubscriberOptions,
  SubscriberLogger,
} from './ws-subscriber-types.js';

export type {
  ConnectionState,
  HaWebSocketFactory,
  HaWebSocketLike,
  HaWebSocketSubscriberOptions,
} from './ws-subscriber-types.js';

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

export class HaWebSocketSubscriber {
  private readonly db: OpenedHaBridgeDb;
  private readonly url: string | undefined;
  private readonly token: string | undefined;
  private readonly factory: HaWebSocketFactory;
  private readonly debounceMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private readonly now: () => number;
  private readonly logger: SubscriberLogger;

  private socket: HaWebSocketLike | undefined;
  private connectionState: ConnectionState;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private commandId = 1;
  private readonly debouncer: HistoryDebouncer;
  private stopped = false;
  private subscribed = false;

  constructor(options: HaWebSocketSubscriberOptions) {
    this.db = options.db;
    this.url = options.url;
    this.token = options.token;
    this.factory = options.webSocketFactory;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? {
      info: (msg, meta) => console.warn(`[ha-bridge] ${msg}`, meta ?? {}),
      warn: (msg, meta) => console.warn(`[ha-bridge] ${msg}`, meta ?? {}),
    };
    this.connectionState =
      this.url === undefined || this.token === undefined
        ? { kind: 'offline', reason: 'no-config', lastEventAt: 0 }
        : { kind: 'connecting' };
    this.debouncer = new HistoryDebouncer({
      debounceMs: this.debounceMs,
      setTimeoutImpl: this.setTimeoutImpl,
      clearTimeoutImpl: this.clearTimeoutImpl,
      flush: (observation) => {
        appendHistory(this.db.db, observation);
      },
    });
  }

  state(): ConnectionState {
    return { ...this.connectionState };
  }

  start(): void {
    if (this.url === undefined || this.token === undefined) {
      this.logger.warn('HA_URL or HA_TOKEN missing — bridge starting in degraded mode');
      return;
    }
    this.openSocket();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) {
      this.clearTimeoutImpl(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.debouncer.cancelAll();
    this.socket?.close();
    this.socket = undefined;
  }

  private openSocket(): void {
    if (this.stopped || this.url === undefined || this.token === undefined) return;
    this.subscribed = false;
    this.commandId = 1;
    const socket = this.factory(this.url);
    this.socket = socket;
    // HA sends `auth_required` immediately on open; the auth response
    // is sent by handleMessage when that frame arrives.
    socket.on('open', () => undefined);
    socket.on('message', (data) => this.handleMessage(data));
    socket.on('close', (code, reason) => this.handleClose(code, reason.toString('utf8')));
    socket.on('error', (err) => this.logger.warn('socket error', { err: err.message }));
  }

  private handleMessage(raw: unknown): void {
    const frame = parseFrame(raw);
    if (frame === undefined) return;
    if (this.handleAuthFrame(frame)) return;
    if (this.handleSnapshotFrame(frame)) return;
    this.handleEventFrame(frame);
  }

  private handleAuthFrame(frame: HaFrame): boolean {
    if (frame.type === 'auth_required') {
      this.socket?.send(JSON.stringify({ type: 'auth', access_token: this.token }));
      return true;
    }
    if (frame.type === 'auth_invalid') {
      this.markAuthFailed();
      return true;
    }
    if (frame.type === 'auth_ok') {
      this.connectionState = { kind: 'connected', lastEventAt: this.now() };
      this.reconnectAttempt = 0;
      this.sendCommand({ type: 'get_states' });
      return true;
    }
    return false;
  }

  private handleSnapshotFrame(frame: HaFrame): boolean {
    if (frame.type !== 'result' || frame.success !== true || !Array.isArray(frame.result)) {
      return false;
    }
    for (const state of frame.result as HaStateObject[]) {
      const input = stateObjectToMirrorInput(state, this.now());
      if (input !== undefined) upsertEntity(this.db.db, input);
    }
    if (!this.subscribed) {
      this.subscribed = true;
      this.sendCommand({ type: 'subscribe_events', event_type: 'state_changed' });
    }
    return true;
  }

  private handleEventFrame(frame: HaFrame): void {
    if (frame.type !== 'event' || frame.event?.event_type !== 'state_changed') return;
    const newState = frame.event.data?.new_state;
    if (newState === undefined || newState === null) return;
    const now = this.now();
    const input = stateObjectToMirrorInput(newState, now);
    if (input === undefined) return;
    upsertEntity(this.db.db, input);
    this.connectionState = { kind: 'connected', lastEventAt: now };
    this.scheduleHistoryDebounced(input);
  }

  private markAuthFailed(): void {
    this.logger.warn('HA auth rejected — switching to degraded mode');
    const lastEventAt =
      this.connectionState.kind === 'offline' ? this.connectionState.lastEventAt : 0;
    this.connectionState = { kind: 'offline', reason: 'auth-failed', lastEventAt };
    this.socket?.close();
    this.socket = undefined;
  }

  private handleClose(code: number, reason: string): void {
    this.socket = undefined;
    if (this.stopped) return;
    if (this.connectionState.kind === 'offline' && this.connectionState.reason === 'auth-failed') {
      return;
    }
    const lastEventAt =
      this.connectionState.kind === 'connected' ? this.connectionState.lastEventAt : 0;
    const delay = this.nextBackoffMs();
    this.connectionState = { kind: 'reconnecting', lastEventAt, nextAttemptInMs: delay };
    this.logger.warn('HA socket closed — scheduling reconnect', { code, reason, delay });
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }

  private nextBackoffMs(): number {
    const exp = Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    return exp;
  }

  private sendCommand(payload: Record<string, unknown>): void {
    const id = this.commandId;
    this.commandId += 1;
    this.socket?.send(JSON.stringify({ id, ...payload }));
  }

  private scheduleHistoryDebounced(input: HaEntityMirrorInput): void {
    this.debouncer.observe({
      entityId: input.entityId,
      state: input.state,
      attributes: input.attributes,
      observedAt: input.lastChanged,
    });
  }
}
