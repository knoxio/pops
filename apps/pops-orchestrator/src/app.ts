/**
 * Express app factory for the orchestrator container.
 *
 * Precursor C2 (ADR-029, epics 06+07) stands up the foundation: the
 * minimal `/health` liveness probe plus the federated `/pillars` view
 * (registry-first via the SDK discovery client, `POPS_PILLARS` seed
 * fallback). The cross-pillar aggregators — federated search (epic 06), the
 * AI-tool registry (epic 07), and possibly the cross-pillar embeddings
 * pipeline — mount here in follow-up increments.
 *
 * Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without binding a real port.
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { type BuildToolList, createAiToolsHandler } from './ai-tools/index.js';
import { type OrchestratorDeps, makeRequestHandler } from './handlers.js';
import { runSearch, type SearchSource } from './search/index.js';

const JSON_BODY_LIMIT = '512kb';

/**
 * Body of `POST /search`. Mirrors each pillar's `/search` envelope
 * (`{ query: { text, filters? }, context? }`) so the orchestrator's federated
 * endpoint is wire-compatible with the per-pillar endpoints it fans out to —
 * the frontend `core.search` repoint (follow-up increment) swaps the target
 * URL without reshaping the request.
 */
const SearchRequestSchema = z.object({
  query: z.object({
    text: z.string(),
    filters: z
      .array(z.object({ field: z.string(), operator: z.string(), value: z.string() }))
      .optional(),
  }),
  context: z
    .object({
      app: z.string().nullable(),
      page: z.string().nullable(),
      entity: z.object({ uri: z.string(), type: z.string(), title: z.string() }).optional(),
      filters: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

export interface CreateOrchestratorAppOptions {
  /**
   * Federated-search hit source override. Production omits this so the route
   * uses the live federation source; tests inject a stub to avoid network /
   * service-account auth.
   */
  readonly searchSource?: SearchSource;
  /**
   * AI-tool registry aggregator override. Production omits this so
   * `GET /ai/tools` uses the SDK's `buildToolList` over the live discovery
   * cache; tests inject a stub to assert the projected tools without a
   * registry round-trip.
   */
  readonly buildToolList?: BuildToolList;
}

export function createOrchestratorApp(
  deps: OrchestratorDeps,
  options: CreateOrchestratorAppOptions = {}
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const handlers = makeRequestHandler(deps);
  const aiTools = createAiToolsHandler(
    options.buildToolList !== undefined ? { buildToolList: options.buildToolList } : {}
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response, next: NextFunction) => {
    void handlers
      .pillars()
      .then((payload) => res.json(payload))
      .catch(next);
  });

  app.post('/search', (req: Request, res: Response) => {
    void handleSearch(req, res, options.searchSource);
  });

  app.get('/ai/tools', (_req: Request, res: Response) => {
    void aiTools().then((payload) => res.json(payload));
  });

  return app;
}

async function handleSearch(
  req: Request,
  res: Response,
  searchSource: SearchSource | undefined
): Promise<void> {
  const parsed = SearchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  const { query, context } = parsed.data;
  try {
    const result = await runSearch({
      text: query.text,
      ...(context !== undefined ? { context } : {}),
      ...(searchSource !== undefined ? { source: searchSource } : {}),
    });
    res.json(result);
  } catch (err) {
    console.error('[orchestrator] federated search failed', err);
    res.status(500).json({ error: 'search_failed' });
  }
}
