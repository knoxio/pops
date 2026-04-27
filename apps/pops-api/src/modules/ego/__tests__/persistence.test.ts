import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { autoTitle, ConversationPersistence } from '../persistence.js';

import type { Database } from 'better-sqlite3';

/** Fixed clock that advances one second per call. */
function makeClock(start = new Date('2026-04-27T10:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 1_000;
    return d;
  };
}

describe('ConversationPersistence', () => {
  let db: Database;
  let svc: ConversationPersistence;

  beforeEach(() => {
    db = createTestDb();
    svc = new ConversationPersistence({
      db: drizzle(db),
      now: makeClock(),
    });
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // createConversation
  // -----------------------------------------------------------------------

  describe('createConversation', () => {
    it('creates a conversation with explicit title', () => {
      const conv = svc.createConversation({ title: 'My Chat', model: 'claude-sonnet-4-20250514' });

      expect(conv.id).toMatch(/^conv_\d{8}_\d{6}_[a-f0-9]{8}$/);
      expect(conv.title).toBe('My Chat');
      expect(conv.model).toBe('claude-sonnet-4-20250514');
      expect(conv.activeScopes).toEqual([]);
      expect(conv.appContext).toBeNull();
      expect(conv.createdAt).toBe('2026-04-27T10:00:00.000Z');
      expect(conv.updatedAt).toBe('2026-04-27T10:00:00.000Z');
    });

    it('creates a conversation without title', () => {
      const conv = svc.createConversation({ model: 'claude-sonnet-4-20250514' });
      expect(conv.title).toBeNull();
    });

    it('stores scopes and appContext as JSON', () => {
      const conv = svc.createConversation({
        model: 'claude-sonnet-4-20250514',
        scopes: ['finance', 'media'],
        appContext: { route: '/finance/transactions', entityId: 'ent_123' },
      });

      expect(conv.activeScopes).toEqual(['finance', 'media']);
      expect(conv.appContext).toEqual({ route: '/finance/transactions', entityId: 'ent_123' });
    });
  });

  // -----------------------------------------------------------------------
  // listConversations
  // -----------------------------------------------------------------------

  describe('listConversations', () => {
    it('returns conversations ordered by updatedAt desc', () => {
      const a = svc.createConversation({ title: 'First', model: 'claude-sonnet-4-20250514' });
      const b = svc.createConversation({ title: 'Second', model: 'claude-sonnet-4-20250514' });
      const c = svc.createConversation({ title: 'Third', model: 'claude-sonnet-4-20250514' });

      const result = svc.listConversations();
      expect(result.total).toBe(3);
      // Most recently created (= most recently updated) first
      expect(result.conversations.map((c) => c.id)).toEqual([c.id, b.id, a.id]);
    });

    it('paginates with limit and offset', () => {
      svc.createConversation({ title: 'A', model: 'm' });
      svc.createConversation({ title: 'B', model: 'm' });
      svc.createConversation({ title: 'C', model: 'm' });

      const page = svc.listConversations({ limit: 1, offset: 1 });
      expect(page.total).toBe(3);
      expect(page.conversations).toHaveLength(1);
      expect(page.conversations[0]?.title).toBe('B');
    });

    it('filters by title search', () => {
      svc.createConversation({ title: 'Finance chat', model: 'm' });
      svc.createConversation({ title: 'Media discussion', model: 'm' });
      svc.createConversation({ title: 'Finance budgets', model: 'm' });

      const result = svc.listConversations({ search: 'Finance' });
      expect(result.total).toBe(2);
      expect(result.conversations.every((c) => c.title?.includes('Finance'))).toBe(true);
    });

    it('returns empty list when no conversations exist', () => {
      const result = svc.listConversations();
      expect(result.total).toBe(0);
      expect(result.conversations).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getConversation
  // -----------------------------------------------------------------------

  describe('getConversation', () => {
    it('returns conversation with messages', () => {
      const conv = svc.createConversation({ title: 'Test', model: 'm' });
      svc.appendMessage(conv.id, { role: 'user', content: 'Hello' });
      svc.appendMessage(conv.id, { role: 'assistant', content: 'Hi there!' });

      const result = svc.getConversation(conv.id);
      expect(result).not.toBeNull();
      expect(result!.conversation.id).toBe(conv.id);
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0]?.role).toBe('user');
      expect(result!.messages[1]?.role).toBe('assistant');
    });

    it('returns null for non-existent conversation', () => {
      expect(svc.getConversation('conv_nonexistent')).toBeNull();
    });

    it('returns messages in chronological order', () => {
      const conv = svc.createConversation({ title: 'Order test', model: 'm' });
      svc.appendMessage(conv.id, { role: 'user', content: 'first' });
      svc.appendMessage(conv.id, { role: 'assistant', content: 'second' });
      svc.appendMessage(conv.id, { role: 'user', content: 'third' });

      const result = svc.getConversation(conv.id);
      expect(result!.messages.map((m) => m.content)).toEqual(['first', 'second', 'third']);
    });
  });

  // -----------------------------------------------------------------------
  // deleteConversation
  // -----------------------------------------------------------------------

  describe('deleteConversation', () => {
    it('deletes conversation and cascades to messages and context', () => {
      const conv = svc.createConversation({ title: 'Doomed', model: 'm' });
      svc.appendMessage(conv.id, { role: 'user', content: 'Hello' });
      svc.upsertContext(conv.id, 'eng_20260101_0000_test', 0.9);

      svc.deleteConversation(conv.id);

      expect(svc.getConversation(conv.id)).toBeNull();

      // Verify messages are gone via raw SQL
      const msgCount = db
        .prepare('SELECT count(*) as c FROM messages WHERE conversation_id = ?')
        .get(conv.id) as { c: number };
      expect(msgCount.c).toBe(0);

      // Verify context is gone
      const ctxCount = db
        .prepare('SELECT count(*) as c FROM conversation_context WHERE conversation_id = ?')
        .get(conv.id) as { c: number };
      expect(ctxCount.c).toBe(0);
    });

    it('is a no-op for non-existent conversation', () => {
      // Should not throw
      svc.deleteConversation('conv_nonexistent');
    });
  });

  // -----------------------------------------------------------------------
  // appendMessage
  // -----------------------------------------------------------------------

  describe('appendMessage', () => {
    it('creates a message and updates conversation updatedAt', () => {
      const conv = svc.createConversation({ title: 'Chat', model: 'm' });
      const originalUpdatedAt = conv.updatedAt;

      const msg = svc.appendMessage(conv.id, {
        role: 'user',
        content: 'Hello world',
        tokensIn: 5,
      });

      expect(msg.id).toMatch(/^msg_\d{8}_\d{6}_[a-f0-9]{8}$/);
      expect(msg.conversationId).toBe(conv.id);
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello world');
      expect(msg.tokensIn).toBe(5);
      expect(msg.tokensOut).toBeNull();
      expect(msg.citations).toBeNull();
      expect(msg.toolCalls).toBeNull();

      // updatedAt should have advanced
      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('stores citations and toolCalls as JSON', () => {
      const conv = svc.createConversation({ model: 'm' });
      const msg = svc.appendMessage(conv.id, {
        role: 'assistant',
        content: 'Based on your notes...',
        citations: ['eng_20260101_0000_note1', 'eng_20260101_0000_note2'],
        toolCalls: [{ name: 'search', args: { query: 'budget' } }],
        tokensIn: 100,
        tokensOut: 50,
      });

      expect(msg.citations).toEqual(['eng_20260101_0000_note1', 'eng_20260101_0000_note2']);
      expect(msg.toolCalls).toEqual([{ name: 'search', args: { query: 'budget' } }]);
    });
  });

  // -----------------------------------------------------------------------
  // Title auto-generation
  // -----------------------------------------------------------------------

  describe('title auto-generation', () => {
    it('auto-generates title from first user message when no title set', () => {
      const conv = svc.createConversation({ model: 'm' });
      expect(conv.title).toBeNull();

      svc.appendMessage(conv.id, { role: 'user', content: 'How do I set up a budget?' });

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.title).toBe('How do I set up a budget?');
    });

    it('does not overwrite an existing title', () => {
      const conv = svc.createConversation({ title: 'Explicit Title', model: 'm' });
      svc.appendMessage(conv.id, { role: 'user', content: 'Something else entirely' });

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.title).toBe('Explicit Title');
    });

    it('strips Markdown formatting from auto-generated title', () => {
      const conv = svc.createConversation({ model: 'm' });
      svc.appendMessage(conv.id, { role: 'user', content: '## **Bold** heading with _emphasis_' });

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.title).toBe('Bold heading with emphasis');
    });

    it('truncates long messages at word boundary', () => {
      const conv = svc.createConversation({ model: 'm' });
      const longContent =
        'This is a very long message that should be truncated at a word boundary to ensure titles remain readable and concise';
      svc.appendMessage(conv.id, { role: 'user', content: longContent });

      const refreshed = svc.getConversation(conv.id);
      const title = refreshed!.conversation.title!;
      expect(title.length).toBeLessThanOrEqual(80);
      expect(title.endsWith(' ')).toBe(false);
      // Should not cut in the middle of a word
      expect(longContent.startsWith(title)).toBe(true);
    });

    it('does not auto-generate from system messages', () => {
      const conv = svc.createConversation({ model: 'm' });
      svc.appendMessage(conv.id, { role: 'system', content: 'System prompt' });

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.title).toBeNull();
    });

    it('does not auto-generate from second user message', () => {
      const conv = svc.createConversation({ model: 'm' });
      // First user message sets the title
      svc.appendMessage(conv.id, { role: 'user', content: 'First question' });
      // Manually clear the title to test second-message behavior
      svc.updateTitle(conv.id, '');

      // Now clear the title manually to simulate edge case
      db.prepare('UPDATE conversations SET title = NULL WHERE id = ?').run(conv.id);

      svc.appendMessage(conv.id, { role: 'user', content: 'Second question' });

      const refreshed = svc.getConversation(conv.id);
      // Should not auto-generate because there are now 2 user messages
      expect(refreshed!.conversation.title).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // upsertContext
  // -----------------------------------------------------------------------

  describe('upsertContext', () => {
    it('inserts a new context entry', () => {
      const conv = svc.createConversation({ model: 'm' });
      svc.upsertContext(conv.id, 'eng_20260101_0000_note', 0.95);

      const row = db
        .prepare('SELECT * FROM conversation_context WHERE conversation_id = ? AND engram_id = ?')
        .get(conv.id, 'eng_20260101_0000_note') as {
        conversation_id: string;
        engram_id: string;
        relevance_score: number;
        loaded_at: string;
      };

      expect(row).toBeTruthy();
      expect(row.relevance_score).toBe(0.95);
      expect(row.loaded_at).toBeTruthy();
    });

    it('updates relevance score on conflict', () => {
      const conv = svc.createConversation({ model: 'm' });
      svc.upsertContext(conv.id, 'eng_20260101_0000_note', 0.5);
      svc.upsertContext(conv.id, 'eng_20260101_0000_note', 0.9);

      const row = db
        .prepare(
          'SELECT relevance_score FROM conversation_context WHERE conversation_id = ? AND engram_id = ?'
        )
        .get(conv.id, 'eng_20260101_0000_note') as { relevance_score: number };

      expect(row.relevance_score).toBe(0.9);
    });

    it('handles null relevance score', () => {
      const conv = svc.createConversation({ model: 'm' });
      svc.upsertContext(conv.id, 'eng_20260101_0000_note');

      const row = db
        .prepare(
          'SELECT relevance_score FROM conversation_context WHERE conversation_id = ? AND engram_id = ?'
        )
        .get(conv.id, 'eng_20260101_0000_note') as { relevance_score: number | null };

      expect(row.relevance_score).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // updateTitle / updateScopes
  // -----------------------------------------------------------------------

  describe('updateTitle', () => {
    it('updates the title and updatedAt', () => {
      const conv = svc.createConversation({ title: 'Old', model: 'm' });
      svc.updateTitle(conv.id, 'New Title');

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.title).toBe('New Title');
      expect(refreshed!.conversation.updatedAt).not.toBe(conv.updatedAt);
    });
  });

  describe('updateScopes', () => {
    it('replaces scopes and updates updatedAt', () => {
      const conv = svc.createConversation({
        model: 'm',
        scopes: ['finance'],
      });
      svc.updateScopes(conv.id, ['media', 'inventory']);

      const refreshed = svc.getConversation(conv.id);
      expect(refreshed!.conversation.activeScopes).toEqual(['media', 'inventory']);
      expect(refreshed!.conversation.updatedAt).not.toBe(conv.updatedAt);
    });
  });
});

// -----------------------------------------------------------------------
// autoTitle unit tests (pure function)
// -----------------------------------------------------------------------

describe('autoTitle', () => {
  it('returns short text as-is', () => {
    expect(autoTitle('Hello')).toBe('Hello');
  });

  it('strips heading markers', () => {
    expect(autoTitle('## My Heading')).toBe('My Heading');
  });

  it('strips bold and italic markers', () => {
    expect(autoTitle('**bold** and _italic_')).toBe('bold and italic');
  });

  it('strips backticks', () => {
    expect(autoTitle('Use `console.log` for debugging')).toBe('Use console.log for debugging');
  });

  it('truncates at word boundary for long text', () => {
    const long = 'word '.repeat(30);
    const title = autoTitle(long);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('word')).toBe(true);
  });

  it('handles empty string', () => {
    expect(autoTitle('')).toBe('');
  });
});
