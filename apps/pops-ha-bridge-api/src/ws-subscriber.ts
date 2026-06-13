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
import { appendHistory, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import { type CallServiceSender } from './ai-tools/call-service-sender.js';
import { parseFrame } from './ha-frame.js';
import { HistoryDebouncer } from './history-debouncer.js';
import { type FireEventSender } from './sinks/fire-event-sender.js';
import {
  handleAuthFrame,
  handleCallServiceResultFrame,
  handleEventFrame,
  handleSnapshotFrame,
  type InboundContext,
} from './ws-inbound.js';
import { createSenderBundle } from './ws-senders.js';
import {
  isPostAuthFailureClose,
  transitionToAuthFailed,
  transitionToReconnecting,
} from './ws-state.js';
import {
  NOOP_SUBSCRIBER_LOGGER,
  type ConnectionState,
  type HaWebSocketFactory,
  type HaWebSocketLike,
  type HaWebSocketSubscriberOptions,
  type SubscriberLogger,
} from './ws-subscriber-types.js';

export type {
  ConnectionState,
  HaWebSocketFactory,
  HaWebSocketLike,
  HaWebSocketSubscriberOptions,
} from './ws-subscriber-types.js';

export type { SendFireEventOutcome } from './sinks/fire-event-sender.js';

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
  private readonly debouncer: HistoryDebouncer;
  private readonly fireEventSender: FireEventSender;
  private readonly callServiceSender: CallServiceSender;
  private socket: HaWebSocketLike | undefined;
  private connectionState: ConnectionState;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private commandId = 1;
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
    this.logger = options.logger ?? NOOP_SUBSCRIBER_LOGGER;
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
    const bundle = createSenderBundle({
      isLive: () =>
        this.connectionState.kind === 'connected' && this.socket !== undefined && this.subscribed,
      sendOnSocket: (data) => this.socket?.send(data),
      nextCommandId: () => {
        const id = this.commandId;
        this.commandId += 1;
        return id;
      },
      logger: this.logger,
      now: this.now,
      setTimeoutImpl: this.setTimeoutImpl,
      clearTimeoutImpl: this.clearTimeoutImpl,
      sinkQueueCap: options.sinkQueueCap,
      callServiceTimeoutMs: options.callServiceTimeoutMs,
    });
    this.fireEventSender = bundle.fireEventSender;
    this.callServiceSender = bundle.callServiceSender;
  }

  state(): ConnectionState {
    return { ...this.connectionState };
  }

  /** PRD-237 US-02: outbound sink — `sendFireEvent` + queue introspection. */
  get sinks(): FireEventSender {
    return this.fireEventSender;
  }

  /** PRD-229 US-04: outbound `ha.entity.callService` AI tool. */
  get aiTools(): { callService: CallServiceSender } {
    return { callService: this.callServiceSender };
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
    this.callServiceSender.cancelAll({ kind: 'rejected', reason: 'ha-offline' });
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
    const ctx = this.inboundContext();
    if (handleAuthFrame(ctx, frame)) return;
    if (handleSnapshotFrame(ctx, frame)) return;
    if (handleCallServiceResultFrame(ctx, frame)) return;
    handleEventFrame(ctx, frame);
  }

  private inboundContext(): InboundContext {
    return {
      db: this.db,
      token: this.token,
      now: this.now,
      debouncer: this.debouncer,
      fireEventSender: this.fireEventSender,
      callServiceSender: this.callServiceSender,
      send: (data) => this.socket?.send(data),
      sendCommand: (payload) => this.sendCommand(payload),
      setConnectionState: (state) => {
        this.connectionState = state;
      },
      onAuthOk: () => {
        this.reconnectAttempt = 0;
      },
      onAuthInvalid: () => this.markAuthFailed(),
      isSubscribed: () => this.subscribed,
      markSubscribed: () => {
        this.subscribed = true;
      },
    };
  }

  private markAuthFailed(): void {
    this.logger.warn('HA auth rejected — switching to degraded mode');
    this.connectionState = transitionToAuthFailed(this.connectionState);
    this.socket?.close();
    this.socket = undefined;
  }
  private handleClose(code: number, reason: string): void {
    this.socket = undefined;
    if (this.stopped || isPostAuthFailureClose(this.connectionState)) return;
    const delay = Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.connectionState = transitionToReconnecting(this.connectionState, delay);
    this.logger.warn('HA socket closed — scheduling reconnect', { code, reason, delay });
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }
  private sendCommand(payload: Record<string, unknown>): void {
    const id = this.commandId;
    this.commandId += 1;
    this.socket?.send(JSON.stringify({ id, ...payload }));
  }
}
