import { describe, expect, it } from 'vitest';

import { resolveUri } from './uri-resolver';

describe('resolveUri', () => {
  describe('media URIs', () => {
    it('resolves movie URI', () => {
      expect(resolveUri('pops:media/movie/42')).toBe('/media/movies/42');
    });

    it('resolves tv-show URI', () => {
      expect(resolveUri('pops:media/tv-show/7')).toBe('/media/tv/7');
    });
  });

  describe('finance URIs', () => {
    it('resolves transaction URI', () => {
      expect(resolveUri('pops:finance/transaction/123')).toBe('/finance/transactions/123');
    });

    it('resolves entity URI', () => {
      expect(resolveUri('pops:finance/entity/5')).toBe('/finance/entities/5');
    });

    it('resolves budget URI', () => {
      expect(resolveUri('pops:finance/budget/8')).toBe('/finance/budgets/8');
    });
  });

  describe('inventory URIs', () => {
    it('resolves item URI', () => {
      expect(resolveUri('pops:inventory/item/99')).toBe('/inventory/items/99');
    });
  });

  describe('malformed URIs', () => {
    it('returns null for non-pops URI', () => {
      expect(resolveUri('https://example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveUri('')).toBeNull();
    });

    it('returns null for unknown domain/type', () => {
      expect(resolveUri('pops:unknown/thing/1')).toBeNull();
    });

    it('returns null for missing ID', () => {
      expect(resolveUri('pops:media/movie/')).toBeNull();
    });

    it('returns null for URI with no slashes after prefix', () => {
      expect(resolveUri('pops:media')).toBeNull();
    });

    it('returns null for pops: with no content', () => {
      expect(resolveUri('pops:')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles string IDs', () => {
      expect(resolveUri('pops:finance/entity/abc')).toBe('/finance/entities/abc');
    });
  });
});
