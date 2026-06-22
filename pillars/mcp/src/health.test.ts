import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Snapshot before module-level mutation so the suite restores cleanly even
// when run alongside other tests in the same vitest worker.
const originalNodeEnv = process.env['NODE_ENV'];
const originalApiKey = process.env['POPS_API_KEY'];
process.env['NODE_ENV'] = 'test';

const { app } = await import('./index.js');

let server: HttpServer;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  // Every test below toggles POPS_API_KEY — reset to the snapshot per-test
  // so the next test starts from the same baseline regardless of which one
  // ran last (or whether one threw mid-assert).
  if (originalApiKey === undefined) delete process.env['POPS_API_KEY'];
  else process.env['POPS_API_KEY'] = originalApiKey;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = originalNodeEnv;
});

describe('GET /health', () => {
  it('returns 200 with status ok regardless of API key configuration', async () => {
    delete process.env['POPS_API_KEY'];
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; tools: number };
    expect(body.status).toBe('ok');
    expect(body.tools).toBeGreaterThan(0);
  });
});

describe('GET /ready', () => {
  it('returns 200 ready when POPS_API_KEY is configured', async () => {
    process.env['POPS_API_KEY'] = 'sa_test';
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      apiKeyConfigured: boolean;
      tools: number;
    };
    expect(body.status).toBe('ready');
    expect(body.apiKeyConfigured).toBe(true);
    expect(body.tools).toBeGreaterThan(0);
  });

  it('returns 503 degraded when POPS_API_KEY is missing', async () => {
    delete process.env['POPS_API_KEY'];
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; apiKeyConfigured: boolean };
    expect(body.status).toBe('degraded');
    expect(body.apiKeyConfigured).toBe(false);
  });
});
