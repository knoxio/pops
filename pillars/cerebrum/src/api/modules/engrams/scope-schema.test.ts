import { describe, expect, it } from 'vitest';

import {
  isSecretScope,
  matchesPrefix,
  normaliseScope,
  parseScope,
  scopeArraySchema,
  scopeStringSchema,
  validateScope,
} from './scope-schema.js';

describe('normaliseScope', () => {
  it('lowercases and trims', () => {
    expect(normaliseScope('  Work.Projects.Karbon  ')).toBe('work.projects.karbon');
    expect(normaliseScope('Personal.Journal')).toBe('personal.journal');
    expect(normaliseScope('work.projects')).toBe('work.projects');
  });
});

describe('scopeStringSchema (Zod)', () => {
  const valid = (input: string, expected?: string) => {
    const result = scopeStringSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && expected !== undefined) expect(result.data).toBe(expected);
  };
  const invalid = (input: string) => {
    expect(scopeStringSchema.safeParse(input).success).toBe(false);
  };

  it('accepts valid two-segment scope', () => valid('personal.journal', 'personal.journal'));
  it('accepts valid three-segment scope', () =>
    valid('work.projects.karbon', 'work.projects.karbon'));
  it('accepts scope with hyphens', () => valid('work.my-project.v2', 'work.my-project.v2'));
  it('accepts max depth (6 segments)', () => valid('a.b.c.d.e.f'));
  it('normalises uppercase to lowercase', () =>
    valid('Work.Projects.Karbon', 'work.projects.karbon'));
  it('normalises with spaces', () => valid('  Work.Projects  ', 'work.projects'));

  it('rejects empty string', () => invalid(''));
  it('rejects single segment', () => invalid('personal'));
  it('rejects trailing dot', () => invalid('work.projects.'));
  it('rejects leading dot', () => invalid('.work.projects'));
  it('rejects consecutive dots', () => invalid('work..projects'));
  it('rejects 7+ segments', () => invalid('a.b.c.d.e.f.g'));
  it('rejects segment exceeding 32 chars', () => invalid(`work.${'a'.repeat(33)}`));
  it('rejects uppercase after normalisation only if chars are invalid', () => {
    // After normalising 'WORK.PROJECTS' → 'work.projects' → valid
    valid('WORK.PROJECTS', 'work.projects');
  });
  it('rejects segment with special chars', () => invalid('work.proj@ect'));
  it('rejects segment with underscore', () => invalid('work.proj_ect'));
});

describe('scopeArraySchema', () => {
  it('accepts array of valid scopes and normalises each', () => {
    const result = scopeArraySchema.safeParse(['Personal.Journal', 'Work.Projects']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(['personal.journal', 'work.projects']);
    }
  });

  it('rejects empty array', () => {
    expect(scopeArraySchema.safeParse([]).success).toBe(false);
  });

  it('rejects array with invalid scope', () => {
    expect(scopeArraySchema.safeParse(['personal.journal', 'bad']).success).toBe(false);
  });
});

describe('parseScope', () => {
  it('parses a two-segment scope', () => {
    const s = parseScope('personal.journal');
    expect(s.segments).toEqual(['personal', 'journal']);
    expect(s.depth).toBe(2);
    expect(s.topLevel).toBe('personal');
    expect(s.isSecret).toBe(false);
    expect(s.raw).toBe('personal.journal');
  });

  it('detects secret segment', () => {
    expect(parseScope('personal.secret.therapy').isSecret).toBe(true);
    expect(parseScope('work.secret.jobsearch').isSecret).toBe(true);
    expect(parseScope('personal.journal').isSecret).toBe(false);
    expect(parseScope('work.projects.karbon').isSecret).toBe(false);
  });

  it('sets topLevel correctly', () => {
    expect(parseScope('work.projects.karbon').topLevel).toBe('work');
    expect(parseScope('storage.recipes').topLevel).toBe('storage');
  });
});

describe('matchesPrefix', () => {
  it('matches same scope exactly', () => {
    expect(matchesPrefix('work.projects', 'work.projects')).toBe(true);
  });

  it('matches child scopes', () => {
    expect(matchesPrefix('work.projects.karbon', 'work')).toBe(true);
    expect(matchesPrefix('work.projects.karbon', 'work.projects')).toBe(true);
  });

  it('does not match sibling scopes', () => {
    expect(matchesPrefix('work.projects.karbon', 'work.project')).toBe(false);
    expect(matchesPrefix('personal.journal', 'work')).toBe(false);
  });

  it('does not match partial segment', () => {
    // 'work.pro' should NOT match 'work.projects.karbon'
    expect(matchesPrefix('work.projects.karbon', 'work.pro')).toBe(false);
  });

  it('handles secret scopes', () => {
    expect(matchesPrefix('work.secret.jobsearch', 'work')).toBe(true);
    expect(matchesPrefix('work.secret.jobsearch', 'work.secret')).toBe(true);
  });
});

describe('isSecretScope', () => {
  it('returns true for secret scopes', () => {
    expect(isSecretScope('personal.secret.therapy')).toBe(true);
    expect(isSecretScope('work.secret.jobsearch')).toBe(true);
    expect(isSecretScope('a.secret.b.c')).toBe(true);
  });

  it('returns false for non-secret scopes', () => {
    expect(isSecretScope('personal.journal')).toBe(false);
    expect(isSecretScope('work.projects.karbon')).toBe(false);
    expect(isSecretScope('storage.recipes')).toBe(false);
  });

  it('does not match partial word "secret"', () => {
    expect(isSecretScope('personal.secretnotes')).toBe(false);
  });
});

describe('validateScope', () => {
  it('returns valid for correct scope', () => {
    const result = validateScope('work.projects.karbon');
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.scope).toBe('work.projects.karbon');
  });

  it('normalises and validates', () => {
    const result = validateScope(' Work.Projects ');
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.scope).toBe('work.projects');
  });

  it('returns errors for invalid scope', () => {
    const result = validateScope('bad');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/at least 2 segments/);
    }
  });

  it('returns multiple errors when applicable', () => {
    const result = validateScope('a.b.c.d.e.f.g'); // too deep
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });
});
