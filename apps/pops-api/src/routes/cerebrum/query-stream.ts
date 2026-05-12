/**
 * SSE endpoint for streaming Cerebrum Query answers (PRD-082, issue #2596).
 *
 * POST /api/cerebrum/query/stream
 *
 * Accepts the same body as `cerebrum.query.ask`, but returns an SSE stream
 * mirroring the shape used by `/api/ego/chat/stream`:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","answer":"...","sources":[...],"scopes":[...],
 *          "confidence":"high|medium|low","tokensIn":N,"tokensOut":N}
 *   data: {"type":"error","message":"..."}
 */
import { type Router as ExpressRouter, Router } from 'express';
import { z } from 'zod';

import { logger } from '../../lib/logger.js';
import { QueryService } from '../../modules/cerebrum/query/query-service.js';
import { HttpError, NotFoundError, ValidationError } from '../../shared/errors.js';

import type { Response } from 'express';

import type { QueryDomain } from '../../modules/cerebrum/query/types.js';

const router: ExpressRouter = Router();

const domainEnum = z.enum(['engrams', 'transactions', 'media', 'inventory']);

const bodySchema = z.object({
  question: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  includeSecret: z.boolean().optional(),
  maxSources: z.number().int().positive().max(50).optional(),
  domains: z.array(domainEnum).optional(),
});

/** Set standard SSE response headers. */
function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Write a single SSE data event. */
function writeSseEvent(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Map domain-level errors into a user-facing message string. */
function describeError(err: unknown): string {
  if (err instanceof NotFoundError || err instanceof ValidationError) return err.message;
  if (err instanceof HttpError) return err.message;
  return err instanceof Error ? err.message : 'Internal server error';
}

interface PipeStreamParams {
  res: Response;
  service: QueryService;
  input: z.infer<typeof bodySchema>;
}

/** Stream events to the SSE client. */
async function pipeStreamEvents(params: PipeStreamParams): Promise<void> {
  const { res, service, input } = params;

  const stream = await service.prepareStream({
    question: input.question,
    scopes: input.scopes,
    includeSecret: input.includeSecret,
    maxSources: input.maxSources,
    domains: input.domains as QueryDomain[] | undefined,
  });

  for await (const event of stream) {
    // Stop writing once the response stream has been destroyed (client gone).
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

router.post('/api/cerebrum/query/stream', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  setSseHeaders(res);

  try {
    await pipeStreamEvents({ res, service: new QueryService(), input: parsed.data });
  } catch (err) {
    const message = describeError(err);
    logger.error({ error: message }, '[QueryEngine] SSE stream error');
    writeSseEvent(res, { type: 'error', message });
  }

  res.end();
});

export default router;
