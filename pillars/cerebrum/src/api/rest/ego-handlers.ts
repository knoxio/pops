/**
 * ts-rest handlers for `ego.*` (pillars/cerebrum/docs/prds/ego-core).
 *
 * Conversation CRUD + context are thin adapters over {@link ConversationPersistence}.
 * `chat` runs the lifted {@link ConversationEngine}: persist the user turn,
 * call the engine (retrieval + injected LLM), then persist the assistant turn +
 * engram context links. A pipeline failure persists a placeholder assistant
 * message and rethrows so Express surfaces a 500.
 *
 * `getConversation`, `setScopes`, and `getActiveContext` map a missing
 * conversation to 404 via the pillar {@link NotFoundError} + `runHttp`.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumEgoContract } from '../../contract/rest-ego.js';
import { type CerebrumDb } from '../../db/index.js';
import {
  persistAssistantError,
  persistAssistantTurn,
  persistUserTurn,
  resolveConversation,
} from '../modules/ego/chat-helpers.js';
import { ConversationEngine } from '../modules/ego/engine.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { EngramService } from '../modules/engrams/service.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { EgoLlm } from '../modules/ego/llm.js';
import type { AppContext } from '../modules/ego/types.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

export interface EgoHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  engramRoot: string;
  templates: TemplateRegistry;
  llm: EgoLlm;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
}

export function makeEgoHandlers(
  deps: EgoHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumEgoContract>> {
  const persistence = (): ConversationPersistence => new ConversationPersistence({ db: deps.db });

  const engine = (): ConversationEngine =>
    new ConversationEngine({
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

  return server.router(cerebrumEgoContract, {
    chat: async ({ body }) => {
      const store = persistence();
      const scopes = body.scopes ?? [];
      const appContext: AppContext | undefined = body.appContext ?? undefined;

      const conversation = resolveConversation({
        persistence: store,
        conversationId: body.conversationId,
        message: body.message,
        scopes,
        appContext,
        model: deps.llm.model(),
      });
      const history = store.getConversation(conversation.id)?.messages ?? [];

      persistUserTurn({
        persistence: store,
        conversationId: conversation.id,
        userMessage: body.message,
        storedAppContext: conversation.appContext as AppContext | undefined | null,
        incomingAppContext: appContext,
      });

      let result;
      try {
        result = await engine().chat({
          conversationId: conversation.id,
          message: body.message,
          history,
          activeScopes: conversation.activeScopes,
          appContext: appContext ?? (conversation.appContext as AppContext | undefined),
          channel: body.channel ?? 'shell',
          knownScopes: body.knownScopes,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        persistAssistantError(store, conversation.id, message);
        throw err instanceof Error ? err : new Error(message);
      }

      const assistantMsg = persistAssistantTurn({
        persistence: store,
        conversationId: conversation.id,
        result,
      });

      return {
        status: 200 as const,
        body: {
          conversationId: conversation.id,
          response: assistantMsg,
          retrievedEngrams: result.retrievedEngrams,
          scopeNegotiation: result.scopeNegotiation ?? null,
        },
      };
    },

    createConversation: async ({ body }) => ({
      status: 200,
      body: { conversation: persistence().createConversation(body) },
    }),

    listConversations: async ({ body }) => ({
      status: 200,
      body: persistence().listConversations(body),
    }),

    getConversation: async ({ params }) =>
      runHttp(() => {
        const result = persistence().getConversation(params.id);
        if (!result) throw new NotFoundError('Conversation', params.id);
        return { status: 200 as const, body: result };
      }),

    deleteConversation: async ({ params }) => {
      persistence().deleteConversation(params.id);
      return { status: 200, body: { success: true as const } };
    },

    setScopes: async ({ params, body }) =>
      runHttp(() => {
        const store = persistence();
        if (!store.getConversation(params.id)) throw new NotFoundError('Conversation', params.id);
        store.updateScopes(params.id, body.scopes);
        return { status: 200 as const, body: { scopes: body.scopes } };
      }),

    getActiveContext: async ({ params }) =>
      runHttp(() => {
        const store = persistence();
        const existing = store.getConversation(params.id);
        if (!existing) throw new NotFoundError('Conversation', params.id);
        const entries = store.getContextEntries(params.id);
        return {
          status: 200 as const,
          body: {
            scopes: existing.conversation.activeScopes,
            appContext: existing.conversation.appContext,
            engrams: entries.map((e) => ({
              engramId: e.engramId,
              relevanceScore: e.relevanceScore,
              loadedAt: e.loadedAt,
            })),
          },
        };
      }),
  });
}
