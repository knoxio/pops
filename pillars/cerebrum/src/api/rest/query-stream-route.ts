/**
 * SSE route handler for streaming cerebrum query answers (PRD-082, issue
 * #2596).
 *
 * `POST /query/stream` — ts-rest can't model SSE, so this is mounted as a plain
 * Express handler in `app.ts` BEFORE `createExpressEndpoints(...)` (food
 * precedent: the recipe-file route is registered ahead of the generated
 * endpoints). The body matches `cerebrum.query.ask` (+ `domains`).
 *
 * It runs the SAME retrieval + context-assembly pipeline as `ask` (via
 * {@link QueryService.prepareStream}) and then streams the injected
 * {@link QueryStreamLlm}'s tokens. Wire shape mirrors the monolith:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","answer":"...","sources":[...],"scopes":[...],
 *          "confidence":"high|medium|low","tokensIn":N,"tokensOut":N}
 *   data: {"type":"error","message":"..."}
 */
import { queryStreamBodySchema } from '../../contract/rest-query-schemas.js';
import { QueryService, type QueryServiceDeps } from '../modules/query/query-service.js';
import { HttpError } from '../shared/errors.js';

import type { Request, RequestHandler, Response } from 'express';

function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function writeSseEvent(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function describeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return err instanceof Error ? err.message : 'Internal server error';
}

async function pipeStreamEvents(
  res: Response,
  service: QueryService,
  input: ReturnType<typeof queryStreamBodySchema.parse>
): Promise<void> {
  const stream = await service.prepareStream({
    question: input.question,
    scopes: input.scopes,
    includeSecret: input.includeSecret,
    maxSources: input.maxSources,
    domains: input.domains,
  });

  for await (const event of stream) {
    if (res.writableEnded || res.destroyed) break;

    if (event.type === 'token') {
      writeSseEvent(res, { type: 'token', text: event.text });
    } else {
      writeSseEvent(res, {
        type: 'done',
        answer: event.answer,
        sources: event.sources,
        scopes: event.scopes,
        confidence: event.confidence,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
      });
    }
  }
}

/**
 * Build the `POST /query/stream` Express handler over the query service deps.
 * Validates the body up-front (400 on failure, before switching to SSE), then
 * sets SSE headers and streams events; pipeline errors are surfaced as a
 * terminal `error` frame.
 */
export function makeQueryStreamHandler(deps: QueryServiceDeps): RequestHandler {
  return (req: Request, res: Response): void => {
    const parsed = queryStreamBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    setSseHeaders(res);

    void (async (): Promise<void> => {
      try {
        await pipeStreamEvents(res, new QueryService(deps), parsed.data);
      } catch (err) {
        writeSseEvent(res, { type: 'error', message: describeError(err) });
      } finally {
        res.end();
      }
    })();
  };
}
