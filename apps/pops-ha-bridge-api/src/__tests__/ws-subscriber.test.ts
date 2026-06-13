import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getEntity, openHaBridgeDb, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';
import { haStateHistory } from '@pops/ha-bridge-db';

import {
  HaWebSocketSubscriber,
  type HaWebSocketFactory,
  type HaWebSocketLike,
} from '../ws-subscriber.js';

interface FakeSocket extends HaWebSocketLike {
  sent: string[];
  emitOpen(): void;
  emitMessage(payload: unknown): void;
  emitClose(code?: number, reason?: string): void;
  emitError(err: Error): void;
}

function createFakeSocket(): FakeSocket {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };
  const sent: string[] = [];
  return {
    sent,
    send(data: string) {
      sent.push(data);
    },
    close() {
      const ls = listeners['close'] ?? [];
      for (const l of ls) l(1000, Buffer.from(''));
    },
    on(event, listener) {
      const arr = listeners[event];
      if (arr !== undefined) arr.push(listener as (...args: unknown[]) => void);
    },
    emitOpen() {
      const ls = listeners['open'] ?? [];
      for (const l of ls) l();
    },
    emitMessage(payload) {
      const serialised = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const ls = listeners['message'] ?? [];
      for (const l of ls) l(serialised);
    },
    emitClose(code = 1006, reason = 'closed') {
      const ls = listeners['close'] ?? [];
      for (const l of ls) l(code, Buffer.from(reason));
    },
    emitError(err) {
      const ls = listeners['error'] ?? [];
      for (const l of ls) l(err);
    },
  };
}

describe('HaWebSocketSubscriber', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-api-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('boots in degraded mode when HA env is missing', () => {
    const factory = vi.fn<HaWebSocketFactory>();
    const sub = new HaWebSocketSubscriber({
      db: opened,
      url: undefined,
      token: undefined,
      webSocketFactory: factory,
    });
    sub.start();
    expect(factory).not.toHaveBeenCalled();
    expect(sub.state()).toEqual({ kind: 'offline', reason: 'no-config', lastEventAt: 0 });
  });

  it('authenticates, snapshots, then subscribes — and never logs the token', () => {
    const fake = createFakeSocket();
    const factory: HaWebSocketFactory = () => fake;
    const sub = new HaWebSocketSubscriber({
      db: opened,
      url: 'ws://ha.local/api/websocket',
      token: 'secret-token-xyz',
      webSocketFactory: factory,
      now: () => 1_000,
    });
    sub.start();

    fake.emitOpen();
    fake.emitMessage({ type: 'auth_required' });
    expect(fake.sent[0]).toContain('"type":"auth"');
    expect(fake.sent[0]).toContain('"access_token":"secret-token-xyz"');

    fake.emitMessage({ type: 'auth_ok' });
    expect(sub.state().kind).toBe('connected');

    // snapshot response: HA returns an array of state objects
    fake.emitMessage({
      id: 1,
      type: 'result',
      success: true,
      result: [
        {
          entity_id: 'light.kitchen_ceiling',
          state: 'on',
          last_changed: new Date(900).toISOString(),
          attributes: { friendly_name: 'Kitchen Ceiling', area_name: 'kitchen' },
        },
      ],
    });

    const row = getEntity(opened.db, 'light.kitchen_ceiling');
    expect(row?.state).toBe('on');
    expect(row?.area).toBe('kitchen');

    // After snapshot the subscriber should have requested the subscription.
    const sentSubscribe = fake.sent.some((s) => s.includes('subscribe_events'));
    expect(sentSubscribe).toBe(true);
  });

  it('debounces per-entity history writes inside the window', async () => {
    const fake = createFakeSocket();
    const sub = new HaWebSocketSubscriber({
      db: opened,
      url: 'ws://ha/api/websocket',
      token: 't',
      webSocketFactory: () => fake,
      debounceMs: 20,
      now: () => 5_000,
    });
    sub.start();
    fake.emitOpen();
    fake.emitMessage({ type: 'auth_required' });
    fake.emitMessage({ type: 'auth_ok' });
    fake.emitMessage({ id: 1, type: 'result', success: true, result: [] });

    for (let i = 0; i < 3; i += 1) {
      fake.emitMessage({
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: {
            entity_id: 'sensor.kitchen_temperature',
            new_state: {
              entity_id: 'sensor.kitchen_temperature',
              state: String(20 + i),
              last_changed: new Date(5_000 + i).toISOString(),
              attributes: { friendly_name: 'Kitchen Temp' },
            },
          },
        },
      });
    }

    const mid = opened.db.select().from(haStateHistory).all();
    expect(mid).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const final = opened.db.select().from(haStateHistory).all();
    expect(final).toHaveLength(1);
    expect(final[0]?.state).toBe('22');

    sub.stop();
  });

  it('uses exponential backoff with the configured cap on reconnect', () => {
    const sockets: FakeSocket[] = [];
    const factory: HaWebSocketFactory = () => {
      const s = createFakeSocket();
      sockets.push(s);
      return s;
    };
    const reconnectCallbacks: (() => void)[] = [];
    const fakeSetTimeout = vi.fn<typeof setTimeout>((fn, _delay) => {
      reconnectCallbacks.push(fn as () => void);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    const fakeClearTimeout = vi.fn<typeof clearTimeout>(() => undefined);
    const sub = new HaWebSocketSubscriber({
      db: opened,
      url: 'ws://ha/api/websocket',
      token: 't',
      webSocketFactory: factory,
      initialBackoffMs: 1_000,
      maxBackoffMs: 8_000,
      setTimeoutImpl: fakeSetTimeout,
      clearTimeoutImpl: fakeClearTimeout,
      now: () => 0,
    });
    sub.start();

    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const socket = sockets.at(-1);
      if (socket === undefined) throw new Error('no socket');
      // Drop immediately on connect — never authenticate — so reconnectAttempt
      // is never reset and we observe the raw backoff progression.
      socket.emitClose(1006, 'lost');
      const lastCall = fakeSetTimeout.mock.calls.at(-1);
      if (lastCall === undefined) throw new Error('expected setTimeout call');
      const delay = lastCall[1];
      delays.push(typeof delay === 'number' ? delay : 0);
      // Fire the reconnect timer so the next iteration has a fresh socket
      // with listeners attached and the per-iteration close lands on it.
      const next = reconnectCallbacks.pop();
      if (next !== undefined) next();
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
    sub.stop();
  });
});
