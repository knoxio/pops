import { describe, expect, it } from 'vitest';

import {
  isSecretScope,
  matchesAudienceScope,
  shouldIncludeEngram,
  filterByScope,
  computeDefaultAudienceScope,
} from '../scope-filter.js';

import type { RetrievalResult } from '../../retrieval/types.js';

function makeResult(sourceId: string, scopes: string[], score = 0.8): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId,
    title: `Engram ${sourceId}`,
    contentPreview: 'Some content',
    score,
    matchType: 'semantic',
    metadata: { scopes },
  };
}

describe('isSecretScope', () => {
  it('returns true for scopes containing a "secret" segment', () => {
    expect(isSecretScope('personal.secret.therapy')).toBe(true);
    expect(isSecretScope('work.secret.jobsearch')).toBe(true);
    expect(isSecretScope('secret.data')).toBe(true);
  });

  it('returns false for non-secret scopes', () => {
    expect(isSecretScope('work.projects.karbon')).toBe(false);
    expect(isSecretScope('personal.journal')).toBe(false);
    expect(isSecretScope('secretive.notes')).toBe(false);
  });
});

describe('matchesAudienceScope', () => {
  it('matches exact scope against audience without wildcard', () => {
    expect(matchesAudienceScope('work', 'work')).toBe(true);
  });

  it('matches child scopes against wildcard audience', () => {
    expect(matchesAudienceScope('work.projects.karbon', 'work.*')).toBe(true);
    expect(matchesAudienceScope('work.meetings', 'work.*')).toBe(true);
  });

  it('does not match unrelated scopes', () => {
    expect(matchesAudienceScope('personal.journal', 'work.*')).toBe(false);
    expect(matchesAudienceScope('work.projects', 'personal.*')).toBe(false);
  });

  it('matches deeper audience scope prefixes', () => {
    expect(matchesAudienceScope('work.projects.karbon.tasks', 'work.projects.*')).toBe(true);
    expect(matchesAudienceScope('work.meetings', 'work.projects.*')).toBe(false);
  });

  it('does not match partial segment matches', () => {
    // "workaholic.stuff" should NOT match "work.*"
    expect(matchesAudienceScope('workaholic.stuff', 'work.*')).toBe(false);
  });
});

describe('shouldIncludeEngram', () => {
  it('excludes engrams with secret scopes when includeSecret is false', () => {
    expect(shouldIncludeEngram(['work.secret.jobsearch'], 'work.*', false)).toBe(false);
  });

  it('includes engrams with secret scopes when includeSecret is true and audience matches', () => {
    expect(shouldIncludeEngram(['work.secret.jobsearch'], 'work.*', true)).toBe(true);
  });

  it('excludes secret engrams outside audience scope even with includeSecret', () => {
    expect(shouldIncludeEngram(['personal.secret.therapy'], 'work.*', true)).toBe(false);
  });

  it('excludes engrams with mixed secret and non-secret scopes when includeSecret is false', () => {
    // An engram with both secret + non-secret scopes is treated as secret
    expect(
      shouldIncludeEngram(['work.projects.karbon', 'work.secret.jobsearch'], 'work.*', false)
    ).toBe(false);
  });

  it('includes non-secret engrams matching audience scope', () => {
    expect(shouldIncludeEngram(['work.projects.karbon'], 'work.*', false)).toBe(true);
  });

  it('excludes non-secret engrams outside audience scope', () => {
    expect(shouldIncludeEngram(['personal.journal'], 'work.*', false)).toBe(false);
  });

  it('includes all non-secret engrams when no audience scope', () => {
    expect(shouldIncludeEngram(['work.projects.karbon'], undefined, false)).toBe(true);
    expect(shouldIncludeEngram(['personal.journal'], undefined, false)).toBe(true);
  });

  it('excludes secret engrams even when no audience scope', () => {
    expect(shouldIncludeEngram(['personal.secret.therapy'], undefined, false)).toBe(false);
  });

  it('includes mixed-scope engram with includeSecret when secret scope matches audience', () => {
    expect(
      shouldIncludeEngram(['work.projects.karbon', 'work.secret.jobsearch'], 'work.*', true)
    ).toBe(true);
  });
});

describe('filterByScope', () => {
  it('filters out secret engrams', () => {
    const results = [
      makeResult('eng_1', ['work.projects']),
      makeResult('eng_2', ['work.secret.data']),
      makeResult('eng_3', ['personal.journal']),
    ];

    const filtered = filterByScope(results, undefined, false);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.sourceId)).toEqual(['eng_1', 'eng_3']);
  });

  it('filters by audience scope', () => {
    const results = [
      makeResult('eng_1', ['work.projects']),
      makeResult('eng_2', ['personal.journal']),
      makeResult('eng_3', ['work.meetings']),
    ];

    const filtered = filterByScope(results, 'work.*', false);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.sourceId)).toEqual(['eng_1', 'eng_3']);
  });

  it('allows secret engrams when includeSecret is true within audience', () => {
    const results = [
      makeResult('eng_1', ['work.projects']),
      makeResult('eng_2', ['work.secret.salary']),
      makeResult('eng_3', ['personal.secret.therapy']),
    ];

    const filtered = filterByScope(results, 'work.*', true);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.sourceId)).toEqual(['eng_1', 'eng_2']);
  });
});

describe('computeDefaultAudienceScope', () => {
  it('returns the broadest common prefix among non-secret scopes', () => {
    const results = [
      makeResult('eng_1', ['work.projects.karbon']),
      makeResult('eng_2', ['work.meetings']),
      makeResult('eng_3', ['work.projects.atlas']),
    ];

    expect(computeDefaultAudienceScope(results)).toBe('work.*');
  });

  it('returns "all" when there are no scopes', () => {
    const results = [makeResult('eng_1', [])];
    expect(computeDefaultAudienceScope(results)).toBe('all');
  });

  it('returns "all" when scopes span different top-level domains', () => {
    const results = [
      makeResult('eng_1', ['work.projects']),
      makeResult('eng_2', ['personal.journal']),
    ];

    expect(computeDefaultAudienceScope(results)).toBe('all');
  });

  it('excludes secret scopes from the computation', () => {
    const results = [
      makeResult('eng_1', ['work.projects']),
      makeResult('eng_2', ['work.secret.salary']),
      makeResult('eng_3', ['work.meetings']),
    ];

    expect(computeDefaultAudienceScope(results)).toBe('work.*');
  });

  it('handles single scope correctly', () => {
    const results = [makeResult('eng_1', ['work.projects.karbon'])];
    expect(computeDefaultAudienceScope(results)).toBe('work.projects.karbon.*');
  });
});
