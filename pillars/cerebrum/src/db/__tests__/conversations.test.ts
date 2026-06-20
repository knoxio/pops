/**
 * Invariant tests for the conversations data-access service against an
 * in-memory SQLite seeded with the package-local conversations baseline
 * migration. Covers conversation CRUD + filters, message append + list
 * + count helpers, context upsert + list + delete, and the FK cascade
 * from conversation deletion across messages + context.
 *
 * The baseline is read from
 * `packages/cerebrum-db/migrations/0052_conversations_baseline.sql` so
 * the table shape under test is identical to the one shipped in the
 * journal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConversationConflictError,
  ConversationNotFoundError,
  MessageConflictError,
  countMessages,
  deleteConversation,
  deleteConversationContext,
  deleteMessage,
  getConversation,
  getMessage,
  insertConversation,
  insertMessage,
  listConversationContext,
  listConversations,
  listMessages,
  requireConversation,
  updateConversation,
  upsertConversationContext,
} from '../services/conversations.js';

import type { InsertConversationRow, InsertMessageRow } from '../services/conversations-types.js';
import type { CerebrumDb } from '../services/internal.js';

const CONVERSATIONS_MIGRATION = join(
  __dirname,
  '../../../migrations/0052_conversations_baseline.sql'
);

function freshDb(): CerebrumDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(CONVERSATIONS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function makeConversation(
  overrides: Partial<InsertConversationRow> & Pick<InsertConversationRow, 'id'>
): InsertConversationRow {
  return {
    title: null,
    activeScopes: [],
    appContext: null,
    model: 'gpt-4',
    createdAt: '2026-06-10T10:00:00Z',
    updatedAt: '2026-06-10T10:00:00Z',
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<InsertMessageRow> & Pick<InsertMessageRow, 'id' | 'conversationId'>
): InsertMessageRow {
  return {
    role: 'user',
    content: 'hello',
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: '2026-06-10T10:00:00Z',
    ...overrides,
  };
}

describe('insertConversation', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('serialises activeScopes + appContext as JSON and round-trips via getConversation', () => {
    const created = insertConversation(
      db,
      makeConversation({
        id: 'conv_1',
        title: 'Trip planning',
        activeScopes: ['work', 'travel'],
        appContext: { pillar: 'cerebrum' },
      })
    );

    expect(created.activeScopes).toEqual(['work', 'travel']);
    expect(created.appContext).toEqual({ pillar: 'cerebrum' });

    const fetched = getConversation(db, 'conv_1');
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Trip planning');
  });

  it('throws ConversationConflictError when the id already exists', () => {
    insertConversation(db, makeConversation({ id: 'conv_dup' }));
    expect(() => insertConversation(db, makeConversation({ id: 'conv_dup' }))).toThrow(
      ConversationConflictError
    );
  });

  it('stores null appContext as SQL NULL (not the string "null")', () => {
    insertConversation(db, makeConversation({ id: 'conv_null_ctx', appContext: null }));
    const fetched = getConversation(db, 'conv_null_ctx');
    expect(fetched?.appContext).toBeNull();
  });
});

describe('getConversation + requireConversation', () => {
  it('getConversation returns null when missing', () => {
    expect(getConversation(freshDb(), 'missing')).toBeNull();
  });

  it('requireConversation throws ConversationNotFoundError when missing', () => {
    expect(() => requireConversation(freshDb(), 'missing')).toThrow(ConversationNotFoundError);
  });
});

describe('listConversations', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(
      db,
      makeConversation({
        id: 'c1',
        title: 'Apple recipes',
        updatedAt: '2026-06-10T10:00:00Z',
      })
    );
    insertConversation(
      db,
      makeConversation({ id: 'c2', title: 'Banana bread', updatedAt: '2026-06-10T11:00:00Z' })
    );
    insertConversation(
      db,
      makeConversation({ id: 'c3', title: 'Apple pie', updatedAt: '2026-06-10T12:00:00Z' })
    );
  });

  it('returns all rows in updated_at desc order with total', () => {
    const result = listConversations(db);
    expect(result.total).toBe(3);
    expect(result.conversations.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('filters by title via LIKE substring match', () => {
    const result = listConversations(db, { search: 'Apple' });
    expect(result.total).toBe(2);
    expect(result.conversations.map((c) => c.id).toSorted()).toEqual(['c1', 'c3']);
  });

  it('paginates with limit + offset on top of filters', () => {
    const page = listConversations(db, { limit: 1, offset: 1 });
    expect(page.conversations.map((c) => c.id)).toEqual(['c2']);
    expect(page.total).toBe(3);
  });
});

describe('updateConversation', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_u', title: 'old' }));
  });

  it('patches mutable columns and bumps updatedAt', () => {
    const updated = updateConversation(db, 'conv_u', {
      title: 'new',
      activeScopes: ['focus'],
      appContext: { mode: 'focus' },
      updatedAt: '2026-06-10T12:00:00Z',
    });
    expect(updated.title).toBe('new');
    expect(updated.activeScopes).toEqual(['focus']);
    expect(updated.appContext).toEqual({ mode: 'focus' });
    expect(updated.updatedAt).toBe('2026-06-10T12:00:00Z');
  });

  it('allows clearing title to null', () => {
    const updated = updateConversation(db, 'conv_u', {
      title: null,
      updatedAt: '2026-06-10T12:00:00Z',
    });
    expect(updated.title).toBeNull();
  });

  it('throws ConversationNotFoundError when the conversation is missing', () => {
    expect(() =>
      updateConversation(db, 'missing', { title: 't', updatedAt: '2026-06-10T12:00:00Z' })
    ).toThrow(ConversationNotFoundError);
  });
});

describe('deleteConversation', () => {
  it('returns 0 when missing (idempotent)', () => {
    expect(deleteConversation(freshDb(), 'missing')).toBe(0);
  });

  it('removes the row and cascades to messages + context', () => {
    const db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_del' }));
    insertMessage(db, makeMessage({ id: 'msg_1', conversationId: 'conv_del' }));
    upsertConversationContext(db, {
      conversationId: 'conv_del',
      engramId: 'eng_a',
      relevanceScore: 0.8,
      loadedAt: '2026-06-10T10:00:00Z',
    });

    expect(deleteConversation(db, 'conv_del')).toBe(1);
    expect(getConversation(db, 'conv_del')).toBeNull();
    expect(listMessages(db, 'conv_del')).toEqual([]);
    expect(listConversationContext(db, 'conv_del')).toEqual([]);
  });
});

describe('insertMessage', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_msg', updatedAt: '2026-06-10T10:00:00Z' }));
  });

  it('serialises citations + toolCalls as JSON and round-trips', () => {
    const created = insertMessage(
      db,
      makeMessage({
        id: 'msg_1',
        conversationId: 'conv_msg',
        role: 'assistant',
        citations: [{ engramId: 'eng_a' }],
        toolCalls: [{ name: 'search', args: { q: 'apple' } }],
        tokensIn: 10,
        tokensOut: 20,
      })
    );
    expect(created.citations).toEqual([{ engramId: 'eng_a' }]);
    expect(created.toolCalls).toEqual([{ name: 'search', args: { q: 'apple' } }]);

    const fetched = getMessage(db, 'msg_1');
    expect(fetched?.tokensIn).toBe(10);
    expect(fetched?.tokensOut).toBe(20);
  });

  it('bumps the parent conversation updatedAt to the message createdAt', () => {
    insertMessage(
      db,
      makeMessage({
        id: 'msg_bump',
        conversationId: 'conv_msg',
        createdAt: '2026-06-10T11:00:00Z',
      })
    );
    expect(getConversation(db, 'conv_msg')?.updatedAt).toBe('2026-06-10T11:00:00Z');
  });

  it('throws ConversationNotFoundError when the parent does not exist', () => {
    expect(() =>
      insertMessage(db, makeMessage({ id: 'msg_orphan', conversationId: 'nope' }))
    ).toThrow(ConversationNotFoundError);
  });

  it('throws MessageConflictError when the message id already exists', () => {
    insertMessage(db, makeMessage({ id: 'msg_dup', conversationId: 'conv_msg' }));
    expect(() =>
      insertMessage(db, makeMessage({ id: 'msg_dup', conversationId: 'conv_msg' }))
    ).toThrow(MessageConflictError);
  });
});

describe('listMessages + countMessages', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_list' }));
    insertMessage(
      db,
      makeMessage({
        id: 'm1',
        conversationId: 'conv_list',
        role: 'user',
        createdAt: '2026-06-10T10:00:00Z',
      })
    );
    insertMessage(
      db,
      makeMessage({
        id: 'm2',
        conversationId: 'conv_list',
        role: 'assistant',
        createdAt: '2026-06-10T10:00:01Z',
      })
    );
    insertMessage(
      db,
      makeMessage({
        id: 'm3',
        conversationId: 'conv_list',
        role: 'user',
        createdAt: '2026-06-10T10:00:02Z',
      })
    );
  });

  it('lists messages in created_at asc order', () => {
    expect(listMessages(db, 'conv_list').map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('counts all messages for a conversation', () => {
    expect(countMessages(db, 'conv_list')).toBe(3);
  });

  it('counts messages filtered by role', () => {
    expect(countMessages(db, 'conv_list', 'user')).toBe(2);
    expect(countMessages(db, 'conv_list', 'assistant')).toBe(1);
    expect(countMessages(db, 'conv_list', 'system')).toBe(0);
  });
});

describe('deleteMessage', () => {
  it('returns 0 when missing (idempotent)', () => {
    expect(deleteMessage(freshDb(), 'missing')).toBe(0);
  });

  it('removes the row and returns 1', () => {
    const db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_dm' }));
    insertMessage(db, makeMessage({ id: 'msg_dm', conversationId: 'conv_dm' }));
    expect(deleteMessage(db, 'msg_dm')).toBe(1);
    expect(getMessage(db, 'msg_dm')).toBeNull();
  });
});

describe('upsertConversationContext', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_ctx' }));
  });

  it('inserts a new context entry', () => {
    upsertConversationContext(db, {
      conversationId: 'conv_ctx',
      engramId: 'eng_a',
      relevanceScore: 0.7,
      loadedAt: '2026-06-10T10:00:00Z',
    });
    const rows = listConversationContext(db, 'conv_ctx');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.engramId).toBe('eng_a');
    expect(rows[0]?.relevanceScore).toBe(0.7);
  });

  it('refreshes relevance_score + loaded_at on conflict (composite PK)', () => {
    upsertConversationContext(db, {
      conversationId: 'conv_ctx',
      engramId: 'eng_a',
      relevanceScore: 0.5,
      loadedAt: '2026-06-10T10:00:00Z',
    });
    upsertConversationContext(db, {
      conversationId: 'conv_ctx',
      engramId: 'eng_a',
      relevanceScore: 0.95,
      loadedAt: '2026-06-10T11:00:00Z',
    });
    const rows = listConversationContext(db, 'conv_ctx');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.relevanceScore).toBe(0.95);
    expect(rows[0]?.loadedAt).toBe('2026-06-10T11:00:00Z');
  });

  it('throws ConversationNotFoundError when the parent is missing', () => {
    expect(() =>
      upsertConversationContext(db, {
        conversationId: 'missing',
        engramId: 'eng_a',
        relevanceScore: 0.5,
        loadedAt: '2026-06-10T10:00:00Z',
      })
    ).toThrow(ConversationNotFoundError);
  });
});

describe('listConversationContext + deleteConversationContext', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertConversation(db, makeConversation({ id: 'conv_lc' }));
    upsertConversationContext(db, {
      conversationId: 'conv_lc',
      engramId: 'eng_a',
      relevanceScore: 0.5,
      loadedAt: '2026-06-10T10:00:00Z',
    });
    upsertConversationContext(db, {
      conversationId: 'conv_lc',
      engramId: 'eng_b',
      relevanceScore: 0.9,
      loadedAt: '2026-06-10T11:00:00Z',
    });
  });

  it('orders entries by loaded_at desc', () => {
    const rows = listConversationContext(db, 'conv_lc');
    expect(rows.map((r) => r.engramId)).toEqual(['eng_b', 'eng_a']);
  });

  it('deletes a single (conversation, engram) pair and leaves the others', () => {
    expect(deleteConversationContext(db, 'conv_lc', 'eng_a')).toBe(1);
    const rows = listConversationContext(db, 'conv_lc');
    expect(rows.map((r) => r.engramId)).toEqual(['eng_b']);
  });

  it('returns 0 when the pair does not exist (idempotent)', () => {
    expect(deleteConversationContext(db, 'conv_lc', 'eng_missing')).toBe(0);
  });
});
