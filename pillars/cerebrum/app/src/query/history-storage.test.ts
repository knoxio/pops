import { beforeEach, describe, expect, it } from 'vitest';

import {
  QUERY_HISTORY_MAX_ENTRIES,
  QUERY_HISTORY_STORAGE_KEY,
  appendHistoryEntry,
  readQueryHistory,
  removeHistoryEntry,
  writeQueryHistory,
} from './history-storage';

import type { QueryHistoryEntry } from './types';

function buildEntry(overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry {
  return {
    id: '1',
    submittedAt: '2026-05-11T01:00:00Z',
    question: 'what is x?',
    scopes: [],
    domains: [],
    includeSecret: false,
    lastConfidence: null,
    lastSourceCount: 0,
    ...overrides,
  };
}

class MemoryStorage implements Storage {
  store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe('history-storage', () => {
  it('returns an empty array when nothing is persisted', () => {
    expect(readQueryHistory(storage)).toEqual([]);
  });

  it('round-trips a list of entries', () => {
    const entries = [buildEntry({ id: 'a' }), buildEntry({ id: 'b', question: 'second?' })];
    writeQueryHistory(entries, storage);
    expect(readQueryHistory(storage)).toEqual(entries);
  });

  it('drops entries with invalid shapes on read', () => {
    storage.setItem(
      QUERY_HISTORY_STORAGE_KEY,
      JSON.stringify([buildEntry({ id: 'ok' }), { id: 'bad' }, null])
    );
    expect(readQueryHistory(storage)).toEqual([buildEntry({ id: 'ok' })]);
  });

  it('appends new entries to the front and deduplicates by question/filter', () => {
    const first = buildEntry({ id: '1', question: 'q' });
    const dupe = buildEntry({ id: '2', question: 'q' });
    const next = appendHistoryEntry([first], dupe);
    expect(next).toEqual([dupe]);
  });

  it('dedupes regardless of scope/domain ordering', () => {
    const first = buildEntry({
      id: '1',
      question: 'q',
      scopes: ['work.*', 'personal.*'],
      domains: ['engrams', 'transactions'],
    });
    const reordered = buildEntry({
      id: '2',
      question: 'q',
      scopes: ['personal.*', 'work.*'],
      domains: ['transactions', 'engrams'],
    });
    const next = appendHistoryEntry([first], reordered);
    expect(next).toEqual([reordered]);
  });

  it('caps the history to the configured maximum', () => {
    const entries = Array.from({ length: QUERY_HISTORY_MAX_ENTRIES + 5 }, (_, i) =>
      buildEntry({ id: String(i), question: `q${i}` })
    );
    let history: QueryHistoryEntry[] = [];
    for (const entry of entries) {
      history = appendHistoryEntry(history, entry);
    }
    expect(history).toHaveLength(QUERY_HISTORY_MAX_ENTRIES);
    expect(history[0]?.id).toBe(String(entries.length - 1));
  });

  it('enforces the max entry cap on read when storage holds oversized data', () => {
    const oversized = Array.from({ length: QUERY_HISTORY_MAX_ENTRIES + 7 }, (_, i) =>
      buildEntry({ id: String(i), question: `q${i}` })
    );
    storage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(oversized));
    const read = readQueryHistory(storage);
    expect(read).toHaveLength(QUERY_HISTORY_MAX_ENTRIES);
    expect(read[0]?.id).toBe('0');
    expect(read[QUERY_HISTORY_MAX_ENTRIES - 1]?.id).toBe(String(QUERY_HISTORY_MAX_ENTRIES - 1));
  });

  it('removes by id', () => {
    expect(removeHistoryEntry([buildEntry({ id: 'a' }), buildEntry({ id: 'b' })], 'a')).toEqual([
      buildEntry({ id: 'b' }),
    ]);
  });
});
