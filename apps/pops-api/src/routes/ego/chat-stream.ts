/**
 * SSE endpoint for streaming ego chat responses (PRD-087 US-01 AC #6).
 *
 * POST /api/ego/chat/stream
 *
 * Accepts the same body as ego.chat, but returns an SSE stream:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","conversationId":"...","citations":[...],"tokensIn":N,"tokensOut":N}
 *
 * Persists messages after the stream completes (same as ego.chat).
 */
import { type Router as ExpressRouter, Router } from 'express';
import { z } from 'zod';

import { logger } from '../../lib/logger.js';
import {
  getEngine,
  getPersistence,
  getStore,
  persistStreamResults,
  resolveConversation,
} from '../../modules/ego/chat-helpers.js';

import type { Request, Response } from 'express';

import type { AppContext, ChatStreamPreparation, Conversation } from '../../modules/ego/types.js';

const router: ExpressRouter = Router();

const bodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: z
    .object({
      app: z.string(),
      route: z.string().optional(),
      entityId: z.string().optional(),
      entityType: z.string().optional(),
    })
    .optional(),
  channel: z.enum(['shell', 'moltbot', 'mcp', 'cli']).optional(),
  knownScopes: z.array(z.string().min(1)).optional(),
});

type ValidatedInput = z.infer<typeof bodySchema>;

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

interface PipeStreamParams {
  req: Request;
  res: Response;
  preparation: ChatStreamPreparation;
  conversation: Conversation;
  input: ValidatedInput;
  appContext: AppContext | undefined;
}

/** Stream events to the SSE client and persist after completion. */
async function pipeStreamEvents(params: PipeStreamParams): Promise<void> {
  const { req, res, preparation, conversation, input, appContext } = params;
  const persistence = getPersistence();
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  for await (const event of preparation.stream) {
    if (clientDisconnected) break;

    if (event.type === 'token') {
      writeSseEvent(res, { type: 'token', text: event.text });
    } else {
      const assistantMsg = persistStreamResults({
        persistence,
        conversationId: conversation.id,
        userMessage: input.message,
        content: event.content,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
        storedAppContext: conversation.appContext as AppContext | undefined | null,
        incomingAppContext: appContext,
      });

      writeSseEvent(res, {
        type: 'done',
        conversationId: conversation.id,
        messageId: assistantMsg.id,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
      });
    }
  }
}

router.post('/api/ego/chat/stream', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const input = parsed.data;
  setSseHeaders(res);

  const scopes = input.scopes ?? [];
  const appContext: AppContext | undefined = input.appContext ?? undefined;

  try {
    const store = getStore();
    const conversation = await resolveConversation({
      store,
      persistence: getPersistence(),
      conversationId: input.conversationId,
      message: input.message,
      scopes,
      appContext,
    });

    const history = await store.getMessages(conversation.id);
    const preparation = await getEngine().prepareStream({
      conversationId: conversation.id,
      message: input.message,
      history,
      activeScopes: conversation.activeScopes,
      appContext: conversation.appContext as AppContext | undefined,
      channel: input.channel ?? 'shell',
      knownScopes: input.knownScopes,
    });

    await pipeStreamEvents({ req, res, preparation, conversation, input, appContext });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[Ego] SSE stream error'
    );
    writeSseEvent(res, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Internal server error',
    });
  }

  res.end();
});

export default router;
