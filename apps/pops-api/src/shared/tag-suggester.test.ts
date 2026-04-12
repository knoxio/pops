import { beforeEach, describe, expect, it, vi } from 'vitest';

import { suggestTags } from './tag-suggester.js';

// Mock entity lookup via DB
const mockEntityGet = vi.fn<() => { defaultTags: string | null } | null>(() => null);
vi.mock('../db.js', () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: (...args: unknown[]) => mockEntityGet(...(args as [])),
        })),
      })),
    })),
  })),
}));

// Mock corrections service
const mockFindAllMatchingCorrections = vi.fn<
  () => { tags: string; descriptionPattern: string | null }[]
>(() => []);
vi.mock('../modules/core/corrections/service.js', () => ({
  findAllMatchingCorrections: (...args: unknown[]) =>
    mockFindAllMatchingCorrections(...(args as [])),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAllMatchingCorrections.mockReturnValue([]);
  mockEntityGet.mockReturnValue(null);
});

describe('suggestTags', () => {
  it('returns empty array when no matches', () => {
    const result = suggestTags({ description: 'UNKNOWN MERCHANT', entityId: null });
    expect(result).toEqual([]);
  });

  describe('correction rule tags (source: rule)', () => {
    it('returns tags from pre-parsed correctionTags with pattern', () => {
      const result = suggestTags({
        description: 'WOOLWORTHS',
        entityId: null,
        correctionTags: ['groceries', 'essentials'],
        correctionPattern: 'WOOLWORTHS%',
      });

      expect(result).toEqual([
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS%' },
        { tag: 'essentials', source: 'rule', pattern: 'WOOLWORTHS%' },
      ]);
    });

    it('falls back to DB corrections when correctionTags not provided', () => {
      mockFindAllMatchingCorrections.mockReturnValue([
        { tags: '["groceries"]', descriptionPattern: 'COLES%' },
        { tags: '["food"]', descriptionPattern: 'COLES%' },
      ]);

      const result = suggestTags({ description: 'COLES SUPERMARKET', entityId: null });

      expect(mockFindAllMatchingCorrections).toHaveBeenCalledWith('COLES SUPERMARKET');
      expect(result).toEqual([
        { tag: 'groceries', source: 'rule', pattern: 'COLES%' },
        { tag: 'food', source: 'rule', pattern: 'COLES%' },
      ]);
    });

    it('handles malformed JSON in correction tags gracefully', () => {
      mockFindAllMatchingCorrections.mockReturnValue([
        { tags: 'not-json', descriptionPattern: 'X' },
        { tags: '["valid"]', descriptionPattern: 'Y' },
      ]);

      const result = suggestTags({ description: 'TEST', entityId: null });
      expect(result).toEqual([{ tag: 'valid', source: 'rule', pattern: 'Y' }]);
    });
  });

  describe('AI category tags (source: ai)', () => {
    it('adds AI category when it matches a known tag (case-insensitive)', () => {
      const result = suggestTags({
        description: 'NETFLIX',
        entityId: null,
        aiCategory: 'entertainment',
        knownTags: ['Entertainment', 'Groceries', 'Transport'],
      });

      expect(result).toEqual([{ tag: 'Entertainment', source: 'ai' }]);
    });

    it('skips AI category when it does not match any known tag', () => {
      const result = suggestTags({
        description: 'NETFLIX',
        entityId: null,
        aiCategory: 'streaming',
        knownTags: ['Entertainment', 'Groceries'],
      });

      expect(result).toEqual([]);
    });

    it('skips AI category when knownTags not provided', () => {
      const result = suggestTags({
        description: 'NETFLIX',
        entityId: null,
        aiCategory: 'entertainment',
      });

      expect(result).toEqual([]);
    });
  });

  describe('entity default tags (source: entity)', () => {
    it('returns entity default tags with source entity', () => {
      mockEntityGet.mockReturnValue({ defaultTags: '["groceries", "essentials"]' });

      const result = suggestTags({ description: 'WOOLWORTHS', entityId: 'entity-1' });

      expect(result).toEqual([
        { tag: 'groceries', source: 'entity' },
        { tag: 'essentials', source: 'entity' },
      ]);
    });

    it('handles null entityId', () => {
      const result = suggestTags({ description: 'UNKNOWN', entityId: null });
      expect(result).toEqual([]);
      expect(mockEntityGet).not.toHaveBeenCalled();
    });

    it('handles malformed entity defaultTags JSON', () => {
      mockEntityGet.mockReturnValue({ defaultTags: '{bad' });

      const result = suggestTags({ description: 'TEST', entityId: 'entity-1' });
      expect(result).toEqual([]);
    });

    it('handles entity with no defaultTags', () => {
      mockEntityGet.mockReturnValue({ defaultTags: null });

      const result = suggestTags({ description: 'TEST', entityId: 'entity-1' });
      expect(result).toEqual([]);
    });
  });

  describe('deduplication and priority', () => {
    it('correction tags take priority over entity tags', () => {
      mockEntityGet.mockReturnValue({ defaultTags: '["groceries", "food"]' });

      const result = suggestTags({
        description: 'WOOLWORTHS',
        entityId: 'entity-1',
        correctionTags: ['groceries'],
        correctionPattern: 'WOOLWORTHS%',
      });

      expect(result).toEqual([
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS%' },
        { tag: 'food', source: 'entity' },
      ]);
    });

    it('AI category does not duplicate correction tags', () => {
      const result = suggestTags({
        description: 'COLES',
        entityId: null,
        correctionTags: ['Groceries'],
        correctionPattern: 'COLES%',
        aiCategory: 'Groceries',
        knownTags: ['Groceries'],
      });

      expect(result).toEqual([{ tag: 'Groceries', source: 'rule', pattern: 'COLES%' }]);
    });

    it('all three sources work together with deduplication', () => {
      mockEntityGet.mockReturnValue({ defaultTags: '["essentials", "groceries"]' });

      const result = suggestTags({
        description: 'WOOLWORTHS',
        entityId: 'entity-1',
        correctionTags: ['groceries'],
        correctionPattern: 'WOOLWORTHS%',
        aiCategory: 'food',
        knownTags: ['Food', 'Groceries'],
      });

      // groceries from rule (first), Food from AI, essentials from entity
      // groceries NOT duplicated from entity
      expect(result).toEqual([
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS%' },
        { tag: 'Food', source: 'ai' },
        { tag: 'essentials', source: 'entity' },
      ]);
    });
  });
});
