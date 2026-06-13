/**
 * Persistence ordering for the chat helpers.
 *
 * The user turn must be persisted before any engine work runs; the assistant
 * turn (or an error placeholder) is persisted after the engine settles. A
 * 4xx from the embedding API or an LLM timeout must not erase the user's
 * own message from the conversation.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../../shared/test-utils.js';
import { persistAssistantError, persistAssistantTurn, persistUserTurn } from '../chat-helpers.js';
import { ConversationPersistence } from '../persistence.js';

import type { Database } from 'better-sqlite3';

import type { ChatResult } from '../types.js';

function makeClock(start = new Date('2026-05-09T10:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 1_000;
    return d;
  };
}

function emptyResult(content: string): ChatResult {
  return {
    response: { content, citations: [], tokensIn: 1, tokensOut: 1 },
    retrievedEngrams: [],
  };
}

describe('chat-helpers persistence ordering', () => {
  let db: Database;
  let persistence: ConversationPersistence;

  beforeEach(() => {
    db = createTestDb();
    persistence = new ConversationPersistence({
      db: drizzle<Record<string, unknown>>(db),
      now: makeClock(),
    });
  });

  afterEach(() => {
    db.close();
  });

  function createConv(): string {
    return persistence.createConversation({ scopes: [], model: 'claude-sonnet-4-6' }).id;
  }

  describe('persistUserTurn', () => {
    it('writes the user message immediately', () => {
      const id = createConv();
      persistUserTurn({ persistence, conversationId: id, userMessage: 'hello' });

      const rows = persistence.getConversation(id)?.messages ?? [];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ role: 'user', content: 'hello' });
    });

    it('updates app context only when the incoming context differs', () => {
      const id = createConv();
      persistUserTurn({
        persistence,
        conversationId: id,
        userMessage: 'm1',
        storedAppContext: null,
        incomingAppContext: { app: 'finance', route: '/transactions' },
      });

      const conv = persistence.getConversation(id)?.conversation;
      expect(conv?.appContext).toEqual({ app: 'finance', route: '/transactions' });
    });
  });

  describe('persistAssistantError', () => {
    it('keeps the user message and adds a visible assistant placeholder', () => {
      const id = createConv();
      persistUserTurn({ persistence, conversationId: id, userMessage: 'hello' });
      persistAssistantError(persistence, id, 'embedding 400');

      const rows = persistence.getConversation(id)?.messages ?? [];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ role: 'user', content: 'hello' });
      expect(rows[1]).toMatchObject({ role: 'assistant' });
      expect(rows[1]?.content).toContain('embedding 400');
    });
  });

  describe('full successful turn', () => {
    it('produces user + assistant rows in order', () => {
      const id = createConv();
      persistUserTurn({ persistence, conversationId: id, userMessage: 'q' });
      persistAssistantTurn({ persistence, conversationId: id, result: emptyResult('answer') });

      const rows = persistence.getConversation(id)?.messages ?? [];
      expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
      expect(rows[1]?.content).toBe('answer');
    });
  });
});
