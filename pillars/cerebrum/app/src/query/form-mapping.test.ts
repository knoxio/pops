import { describe, expect, it } from 'vitest';

import { coerceDomains, validateQueryForm } from './form-mapping';

import type { QueryFormState } from './types';

function makeForm(overrides: Partial<QueryFormState> = {}): QueryFormState {
  return {
    question: '',
    scopes: '',
    domains: [],
    includeSecret: false,
    ...overrides,
  };
}

describe('validateQueryForm', () => {
  it('rejects an empty question', () => {
    const result = validateQueryForm(makeForm({ question: '   ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('questionRequired');
    }
  });

  it('returns a minimal payload for a trimmed question only', () => {
    const result = validateQueryForm(makeForm({ question: '  what is x?  ' }));
    expect(result).toEqual({ ok: true, request: { question: 'what is x?' } });
  });

  it('splits scopes by comma and strips empties', () => {
    const result = validateQueryForm(
      makeForm({ question: 'q', scopes: 'work.*, , personal.health.* ' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(['work.*', 'personal.health.*']);
    }
  });

  it('passes domains through when set', () => {
    const result = validateQueryForm(makeForm({ question: 'q', domains: ['engrams', 'media'] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.domains).toEqual(['engrams', 'media']);
    }
  });

  it('emits includeSecret only when true', () => {
    const off = validateQueryForm(makeForm({ question: 'q', includeSecret: false }));
    const on = validateQueryForm(makeForm({ question: 'q', includeSecret: true }));
    expect(off.ok && off.request.includeSecret).toBe(undefined);
    expect(on.ok && on.request.includeSecret).toBe(true);
  });
});

describe('coerceDomains', () => {
  it('drops unrecognised values', () => {
    expect(coerceDomains(['engrams', 'nope', 'media'])).toEqual(['engrams', 'media']);
  });

  it('returns an empty array for empty input', () => {
    expect(coerceDomains([])).toEqual([]);
  });
});
