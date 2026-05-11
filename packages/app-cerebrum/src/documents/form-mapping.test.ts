import { describe, expect, it } from 'vitest';

import { errorMessageKey, validateForm } from './form-mapping';
import { DEFAULT_DOCUMENTS_FORM } from './types';

describe('validateForm', () => {
  it('rejects report mode without a query', () => {
    const result = validateForm({ ...DEFAULT_DOCUMENTS_FORM, mode: 'report' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('queryRequired');
  });

  it('rejects summary mode without a date range', () => {
    const result = validateForm({ ...DEFAULT_DOCUMENTS_FORM, mode: 'summary' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dateRangeRequired');
  });

  it('rejects an inverted date range', () => {
    const result = validateForm({
      ...DEFAULT_DOCUMENTS_FORM,
      mode: 'summary',
      dateFrom: '2026-05-10',
      dateTo: '2026-05-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dateRangeOrder');
  });

  it('builds the request payload from a valid report form', () => {
    const result = validateForm({
      ...DEFAULT_DOCUMENTS_FORM,
      mode: 'report',
      query: '  agents  ',
      scopes: 'work, work.cerebrum',
      tags: 'ai, ',
      audienceScope: 'work.*',
      includeSecret: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request).toEqual({
        mode: 'report',
        query: 'agents',
        audienceScope: 'work.*',
        includeSecret: true,
        scopes: ['work', 'work.cerebrum'],
        tags: ['ai'],
      });
    }
  });

  it('returns translation keys for every error variant', () => {
    expect(errorMessageKey({ kind: 'queryRequired' })).toBe('documents.form.errors.queryRequired');
    expect(errorMessageKey({ kind: 'dateRangeRequired' })).toBe(
      'documents.form.errors.dateRangeRequired'
    );
    expect(errorMessageKey({ kind: 'dateRangeOrder' })).toBe(
      'documents.form.errors.dateRangeOrder'
    );
  });
});
