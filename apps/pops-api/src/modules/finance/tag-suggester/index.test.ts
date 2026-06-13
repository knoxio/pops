import { beforeEach, describe, expect, it, vi } from 'vitest';

import { suggestTags } from './index.js';

// Mock entity lookup and tag-rules queries via the finance DB handle.
const mockEntityGet = vi.fn<() => { defaultTags: string | null } | null>(() => null);
const mockTagRulesAll = vi.fn<() => { tags: string; descriptionPattern: string }[]>(() => []);

vi.mock('../../../db/finance-handle.js', () => ({
  getFinanceDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: (...args: unknown[]) => mockEntityGet(...(args as [])),
          orderBy: vi.fn(() => ({
            all: (...args: unknown[]) => mockTagRulesAll(...(args as [])),
          })),
        })),
      })),
    })),
  })),
}));

// Mock corrections service
const mockFindAllMatchingCorrections = vi.fn<
  () => { tags: string; descriptionPattern: string | null }[]
>(() => []);
vi.mock('../../core/corrections/service.js', () => ({
  findAllMatchingCorrections: (...args: unknown[]) =>
    mockFindAllMatchingCorrections(...(args as [])),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAllMatchingCorrections.mockReturnValue([]);
  mockEntityGet.mockReturnValue(null);
  mockTagRulesAll.mockReturnValue([]);
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

  describe('tag rule tags from transaction_tag_rules (source: rule)', () => {
    it('returns tags from matching tag rules', () => {
      mockTagRulesAll.mockReturnValue([
        { tags: '["Transport","Public Transport"]', descriptionPattern: 'transportfornsw' },
      ]);

      const result = suggestTags({ description: 'TRANSPORTFORNSWTRAVEL SYDNEY', entityId: null });

      expect(result).toEqual([
        { tag: 'Transport', source: 'rule', pattern: 'transportfornsw' },
        { tag: 'Public Transport', source: 'rule', pattern: 'transportfornsw' },
      ]);
    });

    it('deduplicates tag rule tags against correction tags', () => {
      mockFindAllMatchingCorrections.mockReturnValue([
        { tags: '["Transport"]', descriptionPattern: 'TRANSPORTFORNSW%' },
      ]);
      mockTagRulesAll.mockReturnValue([
        { tags: '["Transport","Public Transport"]', descriptionPattern: 'transportfornsw' },
      ]);

      const result = suggestTags({ description: 'TRANSPORTFORNSWTRAVEL SYDNEY', entityId: null });

      // Transport already added by correction; tag rule contributes only Public Transport
      expect(result).toEqual([
        { tag: 'Transport', source: 'rule', pattern: 'TRANSPORTFORNSW%' },
        { tag: 'Public Transport', source: 'rule', pattern: 'transportfornsw' },
      ]);
    });

    it('returns empty when tag rules return nothing', () => {
      mockTagRulesAll.mockReturnValue([]);
      const result = suggestTags({ description: 'UNKNOWN', entityId: null });
      expect(result).toEqual([]);
    });
  });

  describe('AI tags (source: ai)', () => {
    describe('legacy aiCategory (validates against knownTags)', () => {
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

    describe('aiTags array (direct multi-tag from AI)', () => {
      it('adds all aiTags that are in knownTags', () => {
        const result = suggestTags({
          description: 'AMPOL SYDNEY',
          entityId: null,
          aiTags: ['Charging', 'EV'],
          knownTags: ['Charging', 'EV', 'Transport'],
        });

        expect(result).toEqual([
          { tag: 'Charging', source: 'ai' },
          { tag: 'EV', source: 'ai' },
        ]);
      });

      it('marks aiTags not in knownTags as isNew', () => {
        const result = suggestTags({
          description: 'SOME MARKET',
          entityId: null,
          aiTags: ['Groceries', 'Farmers Market'],
          knownTags: ['Groceries'],
        });

        expect(result).toEqual([
          { tag: 'Groceries', source: 'ai' },
          { tag: 'Farmers Market', source: 'ai', isNew: true },
        ]);
      });

      it('marks all aiTags as isNew when knownTags is empty', () => {
        const result = suggestTags({
          description: 'SOME PLACE',
          entityId: null,
          aiTags: ['Coffee', 'Purchase'],
          knownTags: [],
        });

        expect(result).toEqual([
          { tag: 'Coffee', source: 'ai', isNew: true },
          { tag: 'Purchase', source: 'ai', isNew: true },
        ]);
      });

      it('prefers aiTags over aiCategory when both present', () => {
        const result = suggestTags({
          description: 'NETFLIX',
          entityId: null,
          aiTags: ['Streaming', 'Entertainment'],
          aiCategory: 'Entertainment',
          knownTags: ['Entertainment'],
        });

        // aiTags takes precedence; aiCategory is ignored when aiTags present
        expect(result).toEqual([
          { tag: 'Streaming', source: 'ai', isNew: true },
          { tag: 'Entertainment', source: 'ai' },
        ]);
      });

      it('deduplicates aiTags against correction tags', () => {
        const result = suggestTags({
          description: 'AMPOL SYDNEY',
          entityId: null,
          correctionTags: ['Charging'],
          correctionPattern: 'AMPOL%',
          aiTags: ['Charging', 'EV'],
          knownTags: ['Charging', 'EV'],
        });

        expect(result).toEqual([
          { tag: 'Charging', source: 'rule', pattern: 'AMPOL%' },
          { tag: 'EV', source: 'ai' },
        ]);
      });
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

    it('priority order: correction > tag-rule > ai > entity', () => {
      mockTagRulesAll.mockReturnValue([
        { tags: '["Groceries","Fresh"]', descriptionPattern: 'woolworths' },
      ]);
      mockEntityGet.mockReturnValue({ defaultTags: '["Groceries","Supermarket"]' });

      const result = suggestTags({
        description: 'WOOLWORTHS BONDI',
        entityId: 'entity-1',
        correctionTags: ['Groceries'],
        correctionPattern: 'WOOLWORTHS%',
        aiTags: ['Groceries', 'Food'],
        knownTags: ['Groceries', 'Fresh', 'Food', 'Supermarket'],
      });

      // Correction wins Groceries; tag-rule adds Fresh; AI adds Food; entity adds Supermarket
      expect(result).toEqual([
        { tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS%' },
        { tag: 'Fresh', source: 'rule', pattern: 'woolworths' },
        { tag: 'Food', source: 'ai' },
        { tag: 'Supermarket', source: 'entity' },
      ]);
    });
  });
});
