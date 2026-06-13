/**
 * PRD-229 US-05: HA-native sinks (`ha.notify.send` + `ha.event.fire`).
 *
 * Proves that:
 *   - the bridge manifest projects both ha-native sinks alongside the
 *     PRD-237 mappings,
 *   - publishing to `/_sinks/ha.notify.send` writes a `call_service`
 *     frame on `notify.<service>` with the supplied target/data,
 *   - publishing to `/_sinks/ha.event.fire` writes a `fire_event` frame
 *     with the publisher-supplied event_type and event_data,
 *   - malformed payloads are rejected at the Zod boundary with 400,
 *   - while the WS is reconnecting, both ha-native sinks enqueue and
 *     drain on the next handshake — sharing the existing reconnect
 *     queue.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openHaBridgeDb, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import { createHaBridgeApiApp } from '../../app.js';
import { buildHaBridgeManifest } from '../../manifest.js';
import {
  HaWebSocketSubscriber,
  type HaWebSocketFactory,
  type HaWebSocketLike,
} from '../../ws-subscriber.js';
import { mappings } from '../mapping.js';
import { sinkPayloadSchemas } from '../schemas.js';

interface FakeSocket extends HaWebSocketLike {
  sent: string[];
  emitOpen(): void;
  emitMessage(payload: unknown): void;
  emitClose(code?: number, reason?: string): void;
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
  };
}

function handshake(fake: FakeSocket): void {
  fake.emitOpen();
  fake.emitMessage({ type: 'auth_required' });
  fake.emitMessage({ type: 'auth_ok' });
  fake.emitMessage({ id: 1, type: 'result', success: true, result: [] });
}

const CallServiceFrameSchema = z.object({
  id: z.number(),
  type: z.literal('call_service'),
  domain: z.string(),
  service: z.string(),
  service_data: z.record(z.string(), z.unknown()).optional(),
  target: z.object({ entity_id: z.union([z.string(), z.array(z.string())]) }).optional(),
});

const FireEventFrameSchema = z.object({
  id: z.number(),
  type: z.literal('fire_event'),
  event_type: z.string(),
  event_data: z.record(z.string(), z.unknown()),
});

function findCallServiceFrame(
  fake: FakeSocket
): z.infer<typeof CallServiceFrameSchema> | undefined {
  for (const raw of fake.sent) {
    const parsed = CallServiceFrameSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function findFireEventFrame(
  fake: FakeSocket,
  haEventType: string
): z.infer<typeof FireEventFrameSchema> | undefined {
  for (const raw of fake.sent) {
    const parsed = FireEventFrameSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.event_type === haEventType) return parsed.data;
  }
  return undefined;
}

interface Harness {
  tmpDir: string;
  haBridgeDb: OpenedHaBridgeDb;
  subscriber: HaWebSocketSubscriber;
  sockets: FakeSocket[];
  app: ReturnType<typeof createHaBridgeApiApp>;
  fireReconnect(): void;
  currentSocket(): FakeSocket;
}

function bootHarness(): Harness {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ha-bridge-us05-'));
  const haBridgeDb = openHaBridgeDb(join(tmpDir, 'ha.db'));
  const sockets: FakeSocket[] = [];
  const factory: HaWebSocketFactory = () => {
    const s = createFakeSocket();
    sockets.push(s);
    return s;
  };
  const reconnectCallbacks: (() => void)[] = [];
  const fakeSetTimeoutFn = (fn: () => void): number => {
    reconnectCallbacks.push(fn);
    return 0;
  };
  const fakeClearTimeoutFn = (_id?: number): void => undefined;
  const fakeSetTimeout = fakeSetTimeoutFn as unknown as typeof setTimeout;
  const fakeClearTimeout = fakeClearTimeoutFn as unknown as typeof clearTimeout;
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
  return {
    tmpDir,
    haBridgeDb,
    subscriber,
    sockets,
    app,
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

describe('PRD-229 US-05 — ha-native sinks declared in manifest', () => {
  it('declares both ha.notify.send and ha.event.fire in mappings + manifest descriptors', () => {
    const eventTypes = mappings.map((m) => m.eventType);
    expect(eventTypes).toContain('ha.notify.send');
    expect(eventTypes).toContain('ha.event.fire');

    const manifest = buildHaBridgeManifest('0.1.0');
    const descriptorIds = manifest.sinks?.descriptors.map((d) => d.eventType) ?? [];
    expect(descriptorIds).toContain('ha.notify.send');
    expect(descriptorIds).toContain('ha.event.fire');
  });

  it('registers a Zod schema for each ha-native sink', () => {
    expect(sinkPayloadSchemas['ha.notify.send']).toBeDefined();
    expect(sinkPayloadSchemas['ha.event.fire']).toBeDefined();
  });

  it('does not regress the PRD-237 mapping set (additive only)', () => {
    const eventTypes = mappings.map((m) => m.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'media.watch.completed',
        'finance.balance.low',
        'inventory.item.consumed',
      ])
    );
  });
});

describe('PRD-229 US-05 — ha.notify.send routes to HA call_service', () => {
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

  it('produces a call_service frame on notify.<service> with message + title + target', async () => {
    const res = await request(harness.app)
      .post('/_sinks/ha.notify.send')
      .send({
        service: 'mobile_app_pixel',
        message: 'Laundry is done',
        title: 'Household',
        target: 'group.residents',
        data: { tag: 'laundry', priority: 'high' },
      });

    expect(res.status).toBe(200);
    const frame = findCallServiceFrame(harness.currentSocket());
    expect(frame).toBeDefined();
    expect(frame?.domain).toBe('notify');
    expect(frame?.service).toBe('mobile_app_pixel');
    expect(frame?.service_data).toEqual({
      message: 'Laundry is done',
      title: 'Household',
      tag: 'laundry',
      priority: 'high',
    });
    expect(frame?.target).toEqual({ entity_id: 'group.residents' });
  });

  it('defaults service to "notify" when omitted', async () => {
    const res = await request(harness.app)
      .post('/_sinks/ha.notify.send')
      .send({ message: 'hello' });

    expect(res.status).toBe(200);
    const frame = findCallServiceFrame(harness.currentSocket());
    expect(frame?.domain).toBe('notify');
    expect(frame?.service).toBe('notify');
    expect(frame?.service_data).toEqual({ message: 'hello' });
    expect(frame?.target).toBeUndefined();
  });

  it('rejects payloads missing `message` with 400 + zod issues', async () => {
    const res = await request(harness.app).post('/_sinks/ha.notify.send').send({ title: 'oops' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid-payload', eventType: 'ha.notify.send' });
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(harness.currentSocket().sent.filter((raw) => raw.includes('call_service'))).toEqual([]);
  });
});

describe('PRD-229 US-05 — ha.event.fire routes to HA fire_event', () => {
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

  it('produces a fire_event frame with the publisher-supplied event_type + event_data', async () => {
    const res = await request(harness.app)
      .post('/_sinks/ha.event.fire')
      .send({
        eventType: 'pops_custom_signal',
        eventData: { source: 'cerebrum', score: 0.92 },
      });

    expect(res.status).toBe(200);
    const frame = findFireEventFrame(harness.currentSocket(), 'pops_custom_signal');
    expect(frame).toBeDefined();
    expect(frame?.event_type).toBe('pops_custom_signal');
    expect(frame?.event_data).toEqual({ source: 'cerebrum', score: 0.92 });
  });

  it('defaults event_data to {} when omitted', async () => {
    const res = await request(harness.app)
      .post('/_sinks/ha.event.fire')
      .send({ eventType: 'pops_ping' });

    expect(res.status).toBe(200);
    const frame = findFireEventFrame(harness.currentSocket(), 'pops_ping');
    expect(frame?.event_data).toEqual({});
  });

  it('rejects an uppercase eventType (Zod regex) with 400', async () => {
    const res = await request(harness.app)
      .post('/_sinks/ha.event.fire')
      .send({ eventType: 'POPS_BAD', eventData: {} });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid-payload' });
  });
});

describe('PRD-229 US-05 — ha-native sinks share the reconnect queue', () => {
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

  it('queues ha.notify.send + ha.event.fire frames while reconnecting and drains them on handshake', async () => {
    const firstSocket = harness.currentSocket();
    firstSocket.emitClose(1006, 'lost');
    expect(harness.subscriber.state().kind).toBe('reconnecting');

    const notifyRes = await request(harness.app)
      .post('/_sinks/ha.notify.send')
      .send({ message: 'queued notify' });
    expect(notifyRes.status).toBe(200);

    const fireRes = await request(harness.app)
      .post('/_sinks/ha.event.fire')
      .send({ eventType: 'pops_queued', eventData: { ok: true } });
    expect(fireRes.status).toBe(200);

    expect(firstSocket.sent.length).toBe(0);
    expect(harness.subscriber.sinks.size()).toBe(2);

    harness.fireReconnect();
    const secondSocket = harness.currentSocket();
    expect(secondSocket).not.toBe(firstSocket);
    handshake(secondSocket);

    expect(findCallServiceFrame(secondSocket)).toBeDefined();
    expect(findFireEventFrame(secondSocket, 'pops_queued')).toBeDefined();
    expect(harness.subscriber.sinks.size()).toBe(0);
  });
});
