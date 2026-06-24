/**
 * SSE route for streaming ego chat responses (docs/prds/ego-core).
 *
 * `POST /ego/chat/stream` — accepts the same body as `ego.chat` but returns a
 * `text/event-stream`:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","conversationId":"...","citations":[...],...}
 *
 * ts-rest cannot model SSE, so this is mounted as a plain Express route in
 * `app.ts` BEFORE `createExpressEndpoints`. The user turn is persisted before
 * streaming; the assistant turn + engram context links are persisted after the
 * `done` event (parity with `ego.chat`). A pre-stream failure emits an `error`
 * frame; a mid-stream failure persists a placeholder assistant message and
 * emits an `error` frame.
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';

import { egoChatBodySchema } from '../../contract/rest-ego-schemas.js';
import {
  persistAssistantError,
  persistStreamResults,
  persistUserTurn,
  resolveConversation,
} from '../modules/ego/chat-helpers.js';
import { ConversationEngine } from '../modules/ego/engine.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { EngramService } from '../modules/engrams/service.js';

import type { Conversation, Message } from '../modules/ego/persistence.js';
import type { AppContext, ChatStreamPreparation } from '../modules/ego/types.js';
import type { EgoHandlerDeps } from './ego-handlers.js';

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

interface PipeStreamParams {
  req: Request;
  res: Response;
  persistence: ConversationPersistence;
  preparation: ChatStreamPreparation;
  conversation: Conversation;
}

async function pipeStreamEvents(params: PipeStreamParams): Promise<void> {
  const { req, res, persistence, preparation, conversation } = params;
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
        content: event.content,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
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

function buildEngine(deps: EgoHandlerDeps): ConversationEngine {
  return new ConversationEngine({
    llm: deps.llm,
    search: {
      db: deps.db,
      raw: deps.raw,
      vecAvailable: deps.vecAvailable,
      peers: deps.peers,
      embeddingClient: deps.embeddingClient,
    },
    engramService: new EngramService({
      root: deps.engramRoot,
      db: deps.db,
      templates: deps.templates,
    }),
  });
}

interface ResolvedTurn {
  conversation: Conversation;
  history: Message[];
}

/**
 * Resolve the conversation, snapshot the prior history, and persist the user
 * turn. The history snapshot is taken BEFORE the user turn is appended so the
 * engine sees the prior turns plus the new `message` arg. Emits an SSE `error`
 * frame + ends the response on failure (returns null).
 */
function resolveAndPersistUserTurn(
  deps: EgoHandlerDeps,
  persistence: ConversationPersistence,
  res: Response,
  input: ReturnType<typeof egoChatBodySchema.parse>
): ResolvedTurn | null {
  const appContext: AppContext | undefined = input.appContext ?? undefined;
  try {
    const conversation = resolveConversation({
      persistence,
      conversationId: input.conversationId,
      message: input.message,
      scopes: input.scopes ?? [],
      appContext,
      model: deps.llm.model(),
    });
    const history = persistence.getConversation(conversation.id)?.messages ?? [];
    persistUserTurn({
      persistence,
      conversationId: conversation.id,
      userMessage: input.message,
      storedAppContext: conversation.appContext as AppContext | undefined | null,
      incomingAppContext: appContext,
    });
    return { conversation, history };
  } catch (err) {
    writeSseEvent(res, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Internal server error',
    });
    res.end();
    return null;
  }
}

async function handleStreamRequest(
  deps: EgoHandlerDeps,
  req: Request,
  res: Response
): Promise<void> {
  const parsed = egoChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request body', details: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  setSseHeaders(res);

  const persistence = new ConversationPersistence({ db: deps.db });
  const resolved = resolveAndPersistUserTurn(deps, persistence, res, input);
  if (!resolved) return;
  const { conversation, history } = resolved;
  const appContext: AppContext | undefined = input.appContext ?? undefined;

  try {
    const preparation = await buildEngine(deps).prepareStream({
      conversationId: conversation.id,
      message: input.message,
      history,
      activeScopes: conversation.activeScopes,
      appContext: appContext ?? (conversation.appContext as AppContext | undefined),
      channel: input.channel ?? 'shell',
      knownScopes: input.knownScopes,
    });
    await pipeStreamEvents({ req, res, persistence, preparation, conversation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    persistAssistantError(persistence, conversation.id, message);
    writeSseEvent(res, { type: 'error', conversationId: conversation.id, message });
  }

  res.end();
}

/** Build the SSE router. Mount in `app.ts` before `createExpressEndpoints`. */
export function makeEgoStreamRouter(deps: EgoHandlerDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  router.post('/ego/chat/stream', (req: Request, res: Response) => {
    void handleStreamRequest(deps, req, res);
  });
  return router;
}
