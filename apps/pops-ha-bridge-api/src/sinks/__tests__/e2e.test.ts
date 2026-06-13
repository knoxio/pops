/**
 * PRD-237 US-02 end-to-end test.
 *
 * Proves the full pops → HA path:
 *
 *   orchestrator.publishEvent('media.watch.completed', payload)
 *     → discovery snapshot routes to the ha-bridge pillar
 *     → poster does POST /_sinks/media.watch.completed on the bridge
 *     → bridge router validates + transforms + calls subscriber.sendFireEvent
 *     → ws-subscriber writes the HA `fire_event` frame on the stub socket
 *     → stub socket captures the JSON frame
 *     → assertion: event_type === 'pops_media_watch_completed' AND
 *       event_data deep-equals the transformed payload.
 *
 * Also covers the reconnect-queue path (socket forced into reconnecting,
 * publish → 200 queued, reconnect → drain → frame received) and the
 * boundary rejection path (invalid payload → 400 + pillar-offline
 * recorded by the orchestrator).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openHaBridgeDb, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';
import { publishEvent, type SinkPoster } from '@pops/pillar-sdk/orchestrator';

import { createHaBridgeApiApp } from '../../app.js';
import { buildHaBridgeManifest } from '../../manifest.js';
import {
  HaWebSocketSubscriber,
  type HaWebSocketFactory,
  type HaWebSocketLike,
} from '../../ws-subscriber.js';
import { sinkPayloadSchemas } from '../schemas.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';

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

function handshake(fake: FakeSocket): void {
  fake.emitOpen();
  fake.emitMessage({ type: 'auth_required' });
  fake.emitMessage({ type: 'auth_ok' });
  fake.emitMessage({ id: 1, type: 'result', success: true, result: [] });
}

function findFireEventFrame(
  fake: FakeSocket,
  haEventName: string
): { event_type: string; event_data: Record<string, unknown> } | undefined {
  const FireEventFrameSchema = z.object({
    type: z.literal('fire_event'),
    event_type: z.string(),
    event_data: z.record(z.string(), z.unknown()),
  });
  for (const raw of fake.sent) {
    const parsed = FireEventFrameSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.event_type === haEventName) {
      return { event_type: parsed.data.event_type, event_data: parsed.data.event_data };
    }
  }
  return undefined;
}

function bridgeSnapshot(manifest: ReturnType<typeof buildHaBridgeManifest>): PillarSnapshot {
  return {
    pillarId: 'ha-bridge',
    baseUrl: 'http://ha-bridge.test',
    manifest,
    registered: true,
    lastSeenAt: new Date('2026-06-14T00:00:00Z'),
  };
}

interface Harness {
  tmpDir: string;
  haBridgeDb: OpenedHaBridgeDb;
  subscriber: HaWebSocketSubscriber;
  sockets: FakeSocket[];
  app: ReturnType<typeof createHaBridgeApiApp>;
  poster: SinkPoster;
  fireReconnect(): void;
  currentSocket(): FakeSocket;
}

function bootHarness(): Harness {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ha-bridge-sinks-e2e-'));
  const haBridgeDb = openHaBridgeDb(join(tmpDir, 'ha.db'));
  const sockets: FakeSocket[] = [];
  const factory: HaWebSocketFactory = () => {
    const s = createFakeSocket();
    sockets.push(s);
    return s;
  };
  const reconnectCallbacks: (() => void)[] = [];
  const fakeSetTimeout = ((fn: () => void) => {
    reconnectCallbacks.push(fn);
    return 0;
  }) as unknown as typeof setTimeout;
  const fakeClearTimeout = (() => undefined) as unknown as typeof clearTimeout;
  const subscriber = new HaWebSocketSubscriber({
    db: haBridgeDb,
    url: 'ws://stub.test/api/websocket',
    token: 't',
    webSocketFactory: factory,
    setTimeoutImpl: fakeSetTimeout,
    clearTimeoutImpl: fakeClearTimeout,
    now: () => 0,
  });
  const manifest = buildHaBridgeManifest('0.1.0');
  const app = createHaBridgeApiApp({ manifest, version: '0.1.0', subscriber });

  const poster: SinkPoster = async ({ eventType, payload }) => {
    const res = await request(app).post(`/_sinks/${eventType}`).send(payload);
    if (res.status >= 400) {
      throw new Error(
        `bridge sink rejected ${eventType}: ${res.status} ${JSON.stringify(res.body)}`
      );
    }
  };

  return {
    tmpDir,
    haBridgeDb,
    subscriber,
    sockets,
    app,
    poster,
    fireReconnect: () => {
      const next = reconnectCallbacks.shift();
      if (next === undefined) throw new Error('no pending reconnect timer');
      next();
    },
    currentSocket: () => {
      const s = sockets.at(-1);
      if (s === undefined) throw new Error('no socket created yet');
      return s;
    },
  };
}

describe('PRD-237 US-02 end-to-end: orchestrator → bridge → HA fire_event', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = bootHarness();
    harness.subscriber.start();
    handshake(harness.currentSocket());
    harness.currentSocket().sent.length = 0;
  });

  afterEach(() => {
    harness.subscriber.stop();
    harness.haBridgeDb.raw.close();
    rmSync(harness.tmpDir, { recursive: true, force: true });
  });

  it('routes one orchestrator publish into one HA fire_event frame (happy path)', async () => {
    const payload = {
      mediaId: 'media-123',
      userId: 'user-1',
      occurredAt: '2026-06-14T10:00:00Z',
      durationSeconds: 90,
    };

    const result = await publishEvent({
      eventType: 'media.watch.completed',
      payload,
      discovery: [bridgeSnapshot(buildHaBridgeManifest('0.1.0'))],
      schemas: new Map([['media.watch.completed', sinkPayloadSchemas['media.watch.completed']]]),
      poster: harness.poster,
    });

    expect(result.failures).toEqual([]);
    expect(result.delivered).toEqual([
      { pillarId: 'ha-bridge', eventType: 'media.watch.completed' },
    ]);

    const frame = findFireEventFrame(harness.currentSocket(), 'pops_media_watch_completed');
    expect(frame).toBeDefined();
    expect(frame?.event_type).toBe('pops_media_watch_completed');
    expect(frame?.event_data).toEqual(payload);
  });

  it('queues frames while the socket is reconnecting and drains them on reconnect', async () => {
    const firstSocket = harness.currentSocket();
    firstSocket.emitClose(1006, 'lost');
    expect(harness.subscriber.state().kind).toBe('reconnecting');

    const payload = {
      accountId: 'acct-7',
      balance: 12.5,
      threshold: 50,
      currency: 'USD',
      occurredAt: '2026-06-14T10:05:00Z',
    };

    const result = await publishEvent({
      eventType: 'finance.balance.low',
      payload,
      discovery: [bridgeSnapshot(buildHaBridgeManifest('0.1.0'))],
      schemas: new Map([['finance.balance.low', sinkPayloadSchemas['finance.balance.low']]]),
      poster: harness.poster,
    });

    expect(result.failures).toEqual([]);
    expect(result.delivered).toHaveLength(1);
    expect(findFireEventFrame(firstSocket, 'pops_finance_balance_low')).toBeUndefined();
    expect(harness.subscriber.sinks.size()).toBe(1);

    harness.fireReconnect();
    const secondSocket = harness.currentSocket();
    expect(secondSocket).not.toBe(firstSocket);
    handshake(secondSocket);

    const frame = findFireEventFrame(secondSocket, 'pops_finance_balance_low');
    expect(frame).toBeDefined();
    expect(frame?.event_data).toEqual(payload);
    expect(harness.subscriber.sinks.size()).toBe(0);
  });

  it('rejects a payload that fails the mapping schema with 400 (recorded as pillar-offline)', async () => {
    let bridgeStatus = 0;
    const permissiveRegistry = new Map([['inventory.item.consumed', z.unknown()]]);
    const result = await publishEvent({
      eventType: 'inventory.item.consumed',
      payload: { itemId: 'i-1', quantity: 'not-a-number' },
      discovery: [bridgeSnapshot(buildHaBridgeManifest('0.1.0'))],
      schemas: permissiveRegistry,
      poster: async ({ eventType, payload }) => {
        const res = await request(harness.app).post(`/_sinks/${eventType}`).send(payload);
        bridgeStatus = res.status;
        if (res.status >= 400) {
          throw new Error(`bridge rejected ${eventType} with ${res.status}`);
        }
      },
    });

    expect(bridgeStatus).toBe(400);
    expect(result.delivered).toEqual([]);
    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0];
    expect(failure?.reason).toBe('pillar-offline');
    expect(
      findFireEventFrame(harness.currentSocket(), 'pops_inventory_item_consumed')
    ).toBeUndefined();
  });

  it('returns 404 for unknown eventType paths', async () => {
    const res = await request(harness.app)
      .post('/_sinks/totally.unknown.event')
      .send({ anything: true });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'unknown-event-type' });
  });
});
