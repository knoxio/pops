import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

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

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok regardless of API key configuration', async () => {
    const before = process.env['POPS_API_KEY'];
    delete process.env['POPS_API_KEY'];
    try {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; tools: number };
      expect(body.status).toBe('ok');
      expect(body.tools).toBeGreaterThan(0);
    } finally {
      if (before !== undefined) process.env['POPS_API_KEY'] = before;
    }
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
    const before = process.env['POPS_API_KEY'];
    delete process.env['POPS_API_KEY'];
    try {
      const res = await fetch(`${baseUrl}/ready`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; apiKeyConfigured: boolean };
      expect(body.status).toBe('degraded');
      expect(body.apiKeyConfigured).toBe(false);
    } finally {
      if (before !== undefined) process.env['POPS_API_KEY'] = before;
    }
  });
});
