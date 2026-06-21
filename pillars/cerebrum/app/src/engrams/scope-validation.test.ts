import { describe, expect, it } from 'vitest';

import { findInvalidScopes, isValidScope, normaliseScope } from './scope-validation';

describe('scope-validation', () => {
  describe('isValidScope', () => {
    it('accepts a single segment', () => {
      expect(isValidScope('work')).toBe(true);
    });

    it('accepts a dotted hierarchy', () => {
      expect(isValidScope('work.projects.karbon')).toBe(true);
    });

    it('accepts hyphens within a segment', () => {
      expect(isValidScope('personal.side-projects')).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(isValidScope('')).toBe(false);
      expect(isValidScope('   ')).toBe(false);
    });

    it('rejects leading or trailing dots', () => {
      expect(isValidScope('.work')).toBe(false);
      expect(isValidScope('work.')).toBe(false);
    });

    it('rejects double dots', () => {
      expect(isValidScope('work..projects')).toBe(false);
    });

    it('rejects more than six segments', () => {
      expect(isValidScope('a.b.c.d.e.f.g')).toBe(false);
    });

    it('accepts mixed-case input by normalising to lowercase', () => {
      // The validator normalises first so the edit form can give immediate
      // feedback even before the user's text passes through `normaliseScope`.
      expect(isValidScope('Work.Projects')).toBe(true);
    });

    it('rejects segments starting with hyphen', () => {
      expect(isValidScope('-work')).toBe(false);
    });

    it('rejects illegal characters', () => {
      expect(isValidScope('work/projects')).toBe(false);
      expect(isValidScope('work projects')).toBe(false);
    });
  });

  describe('normaliseScope', () => {
    it('lowercases and trims', () => {
      expect(normaliseScope('  Work.Projects  ')).toBe('work.projects');
    });
  });

  describe('findInvalidScopes', () => {
    it('returns the failing entries unchanged', () => {
      const result = findInvalidScopes(['work', 'BAD..scope', 'personal']);
      expect(result).toEqual(['BAD..scope']);
    });

    it('returns an empty array when all scopes are valid', () => {
      expect(findInvalidScopes(['work', 'personal.journal'])).toEqual([]);
    });
  });
});
