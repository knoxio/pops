/**
 * ts-rest contract for `ego.*` (PRD-087) — the conversational interface.
 *
 * Conversations are single-tenant at the row level (no per-user scoping today),
 * so the surface is served on the docker-network trust boundary with no
 * per-request auth (parity with the other migrated domains). The chat + context
 * procedures carry their inputs as typed bodies; reads that take only an id use
 * a path param.
 *
 * The SSE streaming endpoint (`POST /ego/chat/stream`) is NOT part of this
 * ts-rest contract — it is mounted as a plain Express route in `app.ts` before
 * `createExpressEndpoints` (ts-rest cannot model `text/event-stream`).
 *
 * The wire schemas live in the pure `rest-ego-schemas.ts` module so the contract
 * and the lifted handlers share one source of truth.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  conversationMessageWire,
  conversationWire,
  createConversationBodySchema,
  egoChatBodySchema,
  egoChatResponseSchema,
  getActiveContextResponseSchema,
  listConversationsBodySchema,
  scopeNegotiationWire,
  setScopesBodySchema,
} from './rest-ego-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumEgoContract = c.router({
  chat: {
    method: 'POST',
    path: '/ego/chat',
    summary: 'Run a chat turn: retrieve context, call the LLM, persist turns.',
    body: egoChatBodySchema,
    responses: {
      200: egoChatResponseSchema,
      400: errorBodySchema,
    },
  },
  createConversation: {
    method: 'POST',
    path: '/ego/conversations',
    summary: 'Create a new conversation.',
    body: createConversationBodySchema,
    responses: {
      200: z.object({ conversation: conversationWire }),
      400: errorBodySchema,
    },
  },
  listConversations: {
    method: 'POST',
    path: '/ego/conversations/search',
    summary: 'List conversations (paginated, optional title search).',
    body: listConversationsBodySchema,
    responses: {
      200: z.object({ conversations: z.array(conversationWire), total: z.number().int() }),
      400: errorBodySchema,
    },
  },
  getConversation: {
    method: 'GET',
    path: '/ego/conversations/:id',
    summary: 'Get a conversation with all its messages.',
    pathParams: z.object({ id: z.string().min(1) }),
    responses: {
      200: z.object({
        conversation: conversationWire,
        messages: z.array(conversationMessageWire),
      }),
      404: errorBodySchema,
    },
  },
  deleteConversation: {
    method: 'DELETE',
    path: '/ego/conversations/:id',
    summary: 'Delete a conversation (cascades messages + context).',
    pathParams: z.object({ id: z.string().min(1) }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ success: z.literal(true) }),
    },
  },
  setScopes: {
    method: 'POST',
    path: '/ego/conversations/:id/scopes',
    summary: 'Replace the active scopes for a conversation.',
    pathParams: z.object({ id: z.string().min(1) }),
    body: setScopesBodySchema,
    responses: {
      200: z.object({ scopes: z.array(z.string()) }),
      404: errorBodySchema,
    },
  },
  getActiveContext: {
    method: 'GET',
    path: '/ego/conversations/:id/context',
    summary: 'Return the current context state (scopes, app context, engrams).',
    pathParams: z.object({ id: z.string().min(1) }),
    responses: {
      200: getActiveContextResponseSchema,
      404: errorBodySchema,
    },
  },
});

export type CerebrumEgoContract = typeof cerebrumEgoContract;

export { scopeNegotiationWire };
