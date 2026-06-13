import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURE_API_KEY } from '../fixture/index.js';
import { runAssertion } from '../runner.js';

import type { AddressInfo } from 'node:net';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function listenWith(handler: Handler): Promise<string> {
  const server = createServer((req, res) => handler(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

describe('the harness fails when the pillar is non-compliant', () => {
  it('flags batched responses returned in wrong order', async () => {
    const baseUrl = await listenWith((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify([
          {
            error: {
              code: 'NOT_FOUND',
              message: 'oops',
              data: { code: 'NOT_FOUND', httpStatus: 404 },
            },
          },
          { result: { data: 'ok' } },
        ])
      );
    });

    const result = await runAssertion('WF-05-batched-preserves-order', {
      baseUrl,
      apiKey: FIXTURE_API_KEY,
    });
    expect(result.passed).toBe(false);
  });

  it('flags single-call success that returns the wrong envelope', async () => {
    const baseUrl = await listenWith((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ data: 'wrong shape' }));
    });

    const result = await runAssertion('WF-01-single-call-success', {
      baseUrl,
      apiKey: FIXTURE_API_KEY,
    });
    expect(result.passed).toBe(false);
  });

  it('flags missing Cache-Control on manifest', async () => {
    const baseUrl = await listenWith((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({}));
    });
    const result = await runAssertion('WF-14-manifest-cache-control', {
      baseUrl,
      apiKey: FIXTURE_API_KEY,
    });
    expect(result.passed).toBe(false);
  });

  it('flags X-Request-Id that is not echoed', async () => {
    const baseUrl = await listenWith((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ result: { data: null } }));
    });
    const result = await runAssertion('WF-19-request-id-echo', {
      baseUrl,
      apiKey: FIXTURE_API_KEY,
    });
    expect(result.passed).toBe(false);
  });
});
