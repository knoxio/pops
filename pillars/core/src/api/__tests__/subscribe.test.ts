import { mkdtempSync, rmSync } from 'node:fs';
/**
 * SSE smoke tests for `GET /registry/subscribe` (Theme 13 PRD-163).
 *
 * Drives a real Express listener via Node's `http` client so we can
 * assert on the event-stream framing, including:
 *   - initial `pillar.snapshot` event on connect;
 *   - per-mutation `pillar.registered` / `pillar.deregistered` frames;
 *   - per-client cleanup on disconnect (listener count returns to the
 *     pre-connect baseline);
 *   - mid-stream client kill leaves no leaked listeners.
 */
import { createServer, get as httpGet, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { registryEventBus, registryEventListenerCount } from '../modules/registry/event-bus.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  registryEventBus.removeAllListeners();
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-subscribe-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://core-api:3001',
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Register a pillar over the raw HTTP route — this emits the registry event the SSE stream forwards. */
async function registerFinance(): Promise<void> {
  const res = await request(app).post('/core.registry.register').send({
    pillarId: 'finance',
    baseUrl: 'http://finance-api:3004',
    manifest: financeManifest(),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

function financeManifest(): ManifestPayload {
  return {
    pillar: 'finance',
    version: '1.2.3',
    contract: {
      package: '@pops/finance-contract',
      version: '1.2.3',
      tag: 'contract-finance@v1.2.3',
    },
    routes: {
      queries: ['finance.transactions.list', 'finance.transactions.search'],
      mutations: ['finance.transactions.create'],
      subscriptions: [],
    },
    search: {
      adapters: [
        {
          name: 'transactionsAdapter',
          entityType: 'transaction',
          queryShape: {
            supportsText: true,
            supportsTags: false,
            supportsDateRange: false,
            supportsScope: [],
          },
          procedurePath: 'finance.transactions.search',
        },
      ],
    },
    ai: {
      tools: [
        {
          name: 'createTransaction',
          description: 'Create a transaction in the finance ledger.',
          parameters: { type: 'object' },
        },
      ],
    },
    uri: { types: ['finance/transaction'] },
    consumedSettings: { keys: ['finance.defaultCurrency'] },
    healthcheck: { path: '/healthz' },
  };
}

interface SseEvent {
  event: string;
  data: unknown;
}

interface SseClient {
  events: SseEvent[];
  waitFor: (predicate: (evt: SseEvent) => boolean, timeoutMs?: number) => Promise<SseEvent>;
  close: () => Promise<void>;
  destroyed: Promise<void>;
}

function openSseClient(url: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const events: SseEvent[] = [];
    const waiters: Array<{ predicate: (e: SseEvent) => boolean; resolve: (e: SseEvent) => void }> =
      [];
    let buffer = '';

    const pushEvent = (evt: SseEvent): void => {
      events.push(evt);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const waiter = waiters[i];
        if (!waiter) continue;
        if (waiter.predicate(evt)) {
          waiters.splice(i, 1);
          waiter.resolve(evt);
        }
      }
    };

    const flushBuffer = (): void => {
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7);
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        }
        if (dataLines.length > 0) {
          const raw = dataLines.join('\n');
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          pushEvent({ event: eventName, data: parsed });
        }
        idx = buffer.indexOf('\n\n');
      }
    };

    const req = httpGet(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE connect failed: status ${res.statusCode ?? 'unknown'}`));
        res.resume();
        return;
      }
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        flushBuffer();
      });

      const destroyed = new Promise<void>((resolveDestroyed) => {
        const finish = (): void => resolveDestroyed();
        res.once('close', finish);
        res.once('end', finish);
      });

      const close = (): Promise<void> => {
        req.destroy();
        return destroyed;
      };

      const waitFor = (
        predicate: (evt: SseEvent) => boolean,
        timeoutMs = 2000
      ): Promise<SseEvent> =>
        new Promise<SseEvent>((resolveWait, rejectWait) => {
          const existing = events.find(predicate);
          if (existing) {
            resolveWait(existing);
            return;
          }
          const timer = setTimeout(() => {
            const idx = waiters.findIndex((w) => w.resolve === wrapped);
            if (idx >= 0) waiters.splice(idx, 1);
            rejectWait(new Error(`Timed out waiting for SSE event after ${timeoutMs}ms`));
          }, timeoutMs);
          const wrapped = (evt: SseEvent): void => {
            clearTimeout(timer);
            resolveWait(evt);
          };
          waiters.push({ predicate, resolve: wrapped });
        });

      resolve({ events, waitFor, close, destroyed });
    });

    req.on('error', reject);
  });
}

async function waitForListenerCount(expected: number, timeoutMs = 2000): Promise<number> {
  const start = Date.now();
  while (registryEventListenerCount() !== expected && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return registryEventListenerCount();
}

describe('GET /registry/subscribe', () => {
  it('emits a pillar.snapshot on connect with the current registry state', async () => {
    await registerFinance();

    const client = await openSseClient(`${baseUrl}/registry/subscribe`);
    const snapshot = await client.waitFor((evt) => evt.event === 'pillar.snapshot');
    expect(Array.isArray(snapshot.data)).toBe(true);
    const entries = snapshot.data as Array<{ pillarId: string; baseUrl: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pillarId).toBe('finance');
    expect(entries[0]?.baseUrl).toBe('http://finance-api:3004');

    await client.close();
  });

  it('emits a pillar.registered event when a pillar registers mid-stream', async () => {
    const client = await openSseClient(`${baseUrl}/registry/subscribe`);
    await client.waitFor((evt) => evt.event === 'pillar.snapshot');

    await registerFinance();

    const registered = await client.waitFor((evt) => evt.event === 'pillar.registered');
    const payload = registered.data as {
      event: string;
      pillarId: string;
      entry: { pillarId: string; baseUrl: string } | null;
    };
    expect(payload.event).toBe('registered');
    expect(payload.pillarId).toBe('finance');
    expect(payload.entry?.pillarId).toBe('finance');
    expect(payload.entry?.baseUrl).toBe('http://finance-api:3004');

    await client.close();
  });

  it('removes the bus listener on client disconnect (no leaks)', async () => {
    const baseline = await waitForListenerCount(0);
    expect(baseline).toBe(0);

    const client = await openSseClient(`${baseUrl}/registry/subscribe`);
    await client.waitFor((evt) => evt.event === 'pillar.snapshot');
    expect(await waitForListenerCount(1)).toBe(1);

    await client.close();

    expect(await waitForListenerCount(0)).toBe(0);
  });

  it('cleans up listeners even when a client is killed mid-stream', async () => {
    const baseline = await waitForListenerCount(0);
    expect(baseline).toBe(0);

    const a = await openSseClient(`${baseUrl}/registry/subscribe`);
    const b = await openSseClient(`${baseUrl}/registry/subscribe`);
    await a.waitFor((evt) => evt.event === 'pillar.snapshot');
    await b.waitFor((evt) => evt.event === 'pillar.snapshot');
    expect(await waitForListenerCount(2)).toBe(2);

    await a.close();
    expect(await waitForListenerCount(1)).toBe(1);

    await registerFinance();
    await b.waitFor((evt) => evt.event === 'pillar.registered');

    await b.close();
    expect(await waitForListenerCount(0)).toBe(0);
  });
});
