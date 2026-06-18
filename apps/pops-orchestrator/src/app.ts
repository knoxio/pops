/**
 * Express app factory for the orchestrator container.
 *
 * Precursor C2 (ADR-029, epics 06+07) stands up the foundation: the
 * minimal `/health` liveness probe plus the federated `/pillars` view
 * derived from `POPS_PILLARS`. The cross-pillar aggregators — federated
 * search (epic 06), the AI-tool registry (epic 07), and possibly the
 * cross-pillar embeddings pipeline — mount here in follow-up increments.
 *
 * Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without binding a real port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type OrchestratorDeps, makeRequestHandler } from './handlers.js';

const JSON_BODY_LIMIT = '512kb';

export function createOrchestratorApp(deps: OrchestratorDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  return app;
}
