import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { handleHealth, handleManifest, handlePost, handleRegister } from './handlers.js';
import { pickRequestId } from './io.js';
import { respondTrpcError } from './responses.js';
import { handleSubscription } from './subscription.js';

import type { AddressInfo } from 'node:net';

export { FIXTURE_API_KEY, FIXTURE_PILLAR_ID, buildFixtureManifest } from './manifest.js';

export type FixturePillarOptions = {
  /** Override the heartbeat cadence for tests. Defaults to 100ms. */
  heartbeatMs?: number;
};

export type FixturePillar = {
  baseUrl: string;
  close: () => Promise<void>;
};

/**
 * Boot a minimal in-process pillar that satisfies every WF-NN-* assertion.
 *
 * This is the reference TS implementation: the conformance suite is
 * proven green against it on every CI run, so any external port (e.g.
 * the Rust pillar from PRD-233) can compare itself against a known-good
 * baseline.
 */
export async function startFixturePillar(
  options: FixturePillarOptions = {}
): Promise<FixturePillar> {
  const heartbeatMs = options.heartbeatMs ?? 100;
  const server = createServer((req, res) => {
    void handle(req, res, heartbeatMs).catch((err) => {
      const message = err instanceof Error ? err.message : 'oops';
      respondTrpcError(res, 'INTERNAL_SERVER_ERROR', message);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  heartbeatMs: number
): Promise<void> {
  res.setHeader('X-Request-Id', pickRequestId(req));
  res.setHeader('X-Pops-Wire-Version', '1');

  const wire = req.headers['x-pops-wire-version'];
  if (typeof wire === 'string' && wire !== '1') {
    respondTrpcError(res, 'METHOD_NOT_SUPPORTED', `wire version ${wire} not supported`, {
      supportedVersions: [1],
    });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  await route(req, res, url, heartbeatMs);
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  heartbeatMs: number
): Promise<void> {
  if (url.pathname === '/health') return handleHealth(req, res, url);
  if (url.pathname === '/manifest.json') return handleManifest(res);
  if (!url.pathname.startsWith('/trpc/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'unknown path',
          data: { code: 'NOT_FOUND', httpStatus: 404 },
        },
      })
    );
    return;
  }

  const path = url.pathname.slice('/trpc/'.length);
  if (path === 'core.registry.register') return handleRegister(req, res);
  if (req.method === 'GET') return handleSubscription(res, path, url, heartbeatMs);
  if (req.method === 'POST') return handlePost(req, res, path);
  res.statusCode = 405;
  res.end();
}
