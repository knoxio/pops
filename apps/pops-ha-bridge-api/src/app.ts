/**
 * Express app factory for the HA bridge pillar (PRD-229 US-01).
 *
 * Surfaces only the minimal probe endpoints in this PR: `/health` for
 * the standard pillar-runtime check and `/manifest.json` so deployers /
 * tests can introspect what dimensions the pillar declares. The tRPC
 * read surface (`entities.list` / `entities.get` / `entities.history` /
 * `connection.status`) lands with US-02 / US-03.
 */
import express, { type Express, type Request, type Response } from 'express';

import { createSinkRouter } from './sinks/router.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import type { ConnectionState, HaWebSocketSubscriber } from './ws-subscriber.js';

export interface HaBridgeAppDeps {
  manifest: ManifestPayload;
  version: string;
  subscriber: Pick<HaWebSocketSubscriber, 'state' | 'sinks'>;
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
}

export interface HealthResponse {
  ok: true;
  status: 'ok' | 'degraded';
  pillar: 'ha-bridge';
  version: string;
  connection: ConnectionState;
  ts: string;
}

export function createHaBridgeApiApp(deps: HaBridgeAppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req: Request, res: Response) => {
    const connection = deps.subscriber.state();
    const status: HealthResponse['status'] = connection.kind === 'connected' ? 'ok' : 'degraded';
    const body: HealthResponse = {
      ok: true,
      status,
      pillar: 'ha-bridge',
      version: deps.version,
      connection,
      ts: new Date().toISOString(),
    };
    res.json(body);
  });

  app.get('/manifest.json', (_req: Request, res: Response) => {
    res.json(deps.manifest);
  });

  app.use(
    createSinkRouter({
      fireEvent: (eventType, haEventName, eventData) =>
        deps.subscriber.sinks.send(eventType, haEventName, eventData),
      logger: deps.logger,
    })
  );

  return app;
}
