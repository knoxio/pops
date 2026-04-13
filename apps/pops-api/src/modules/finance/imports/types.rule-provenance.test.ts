import { describe, expect, it } from 'vitest';

import { ruleProvenanceSchema } from './types.js';

describe('ruleProvenanceSchema', () => {
  it('accepts a valid provenance payload', () => {
    const parsed = ruleProvenanceSchema.parse({
      source: 'correction',
      ruleId: 'corr_123',
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.92,
    });

    expect(parsed.ruleId).toBe('corr_123');
  });

  it('rejects invalid confidence', () => {
    expect(() =>
      ruleProvenanceSchema.parse({
        source: 'correction',
        ruleId: 'corr_123',
        pattern: 'WOOLWORTHS',
        matchType: 'contains',
        confidence: 2,
      })
    ).toThrow();
  });
});
