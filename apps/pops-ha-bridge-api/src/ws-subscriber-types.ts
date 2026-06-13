/**
 * Public type surface for the HA WebSocket subscriber. Kept in a sibling
 * module so `ws-subscriber.ts` stays focused on the state machine and
 * fits the per-file LOC ceiling. Consumers import from this module
 * directly OR from `./ws-subscriber.ts` via the re-export.
 */
import type { OpenedHaBridgeDb } from '@pops/ha-bridge-db';

export type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'connected'; lastEventAt: number }
  | { kind: 'reconnecting'; lastEventAt: number; nextAttemptInMs: number }
  | { kind: 'offline'; reason: 'no-config' | 'auth-failed' | 'disconnected'; lastEventAt: number };

export interface HaWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

export interface HaWebSocketFactory {
  (url: string): HaWebSocketLike;
}

export interface SubscriberLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export const NOOP_SUBSCRIBER_LOGGER: SubscriberLogger = {
  info: () => undefined,
  warn: () => undefined,
};

export interface HaWebSocketSubscriberOptions {
  db: OpenedHaBridgeDb;
  url: string | undefined;
  token: string | undefined;
  webSocketFactory: HaWebSocketFactory;
  debounceMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  now?: () => number;
  logger?: SubscriberLogger;
  /**
   * PRD-237 US-02: cap for the outbound `fire_event` reconnect queue.
   * Frames pushed while the WS is reconnecting are buffered up to this
   * many entries; at-cap pushes drop the oldest. Defaults to 100 per
   * the PRD heuristic.
   */
  sinkQueueCap?: number;
}
