import { beforeEach, describe, expect, it } from 'vitest';

import { clearDraft, draftStorageKey, readDraft, writeDraft } from './draft-storage';

import type { EngramDraft } from './types';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const sampleDraft: EngramDraft = {
  id: 'eng_20260417_0942_test',
  title: 'Test',
  body: 'Body',
  scopes: ['work'],
  tags: ['ai'],
  status: 'active',
  updatedAt: '2026-04-17T09:42:00Z',
  baseContentHash: 'abc123',
};

describe('draft-storage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('round-trips a draft via write + read', () => {
    writeDraft(sampleDraft, storage);
    expect(readDraft(sampleDraft.id, storage)).toEqual(sampleDraft);
  });

  it('returns null when no draft exists', () => {
    expect(readDraft('eng_missing', storage)).toBeNull();
  });

  it('returns null when stored value is malformed JSON', () => {
    storage.setItem(draftStorageKey('eng_x'), 'not-json');
    expect(readDraft('eng_x', storage)).toBeNull();
  });

  it('returns null when stored value fails the shape check', () => {
    storage.setItem(draftStorageKey('eng_x'), JSON.stringify({ id: 'eng_x', body: null }));
    expect(readDraft('eng_x', storage)).toBeNull();
  });

  it('clearDraft removes the entry', () => {
    writeDraft(sampleDraft, storage);
    clearDraft(sampleDraft.id, storage);
    expect(readDraft(sampleDraft.id, storage)).toBeNull();
  });

  it('writeDraft swallows quota errors instead of throwing', () => {
    const throwing: Storage = {
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      clear: storage.clear.bind(storage),
      key: storage.key.bind(storage),
      get length() {
        return storage.length;
      },
      setItem(): void {
        throw new Error('quota exceeded');
      },
    };
    expect(() => writeDraft(sampleDraft, throwing)).not.toThrow();
  });
});
