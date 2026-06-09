import { afterEach, describe, expect, it } from 'vitest';

import { startHealthServer } from '../health.js';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }
});

function urlFor(s: Server, path: string): string {
  const addr = s.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}${path}`;
}

describe('startHealthServer', () => {
  it('returns the documented healthz JSON shape', async () => {
    server = startHealthServer(0, {
      isQueueRunning: () => true,
      getActiveJobCount: () => 3,
    });
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));

    const res = await fetch(urlFor(server, '/healthz'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { ok: boolean; queueRunning: boolean; activeJobs: number };
    expect(body).toEqual({ ok: true, queueRunning: true, activeJobs: 3 });
  });

  it('reflects current queue state on each call', async () => {
    let running = true;
    let active = 0;
    server = startHealthServer(0, {
      isQueueRunning: () => running,
      getActiveJobCount: () => active,
    });
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));

    const first = await (await fetch(urlFor(server, '/healthz'))).json();
    expect(first).toMatchObject({ queueRunning: true, activeJobs: 0 });

    running = false;
    active = 5;
    const second = await (await fetch(urlFor(server, '/healthz'))).json();
    expect(second).toMatchObject({ queueRunning: false, activeJobs: 5 });
  });

  it('404s on unknown paths', async () => {
    server = startHealthServer(0, {
      isQueueRunning: () => true,
      getActiveJobCount: () => 0,
    });
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));

    const res = await fetch(urlFor(server, '/anything-else'));
    expect(res.status).toBe(404);
  });
});
