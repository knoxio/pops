import { describe, expect, it } from 'vitest';

import { computeLearnableTags, descriptionPatternFromGroup } from './tag-rule-learn-helpers';

describe('descriptionPatternFromGroup', () => {
  it('returns longest common prefix when >= 4 chars', () => {
    expect(descriptionPatternFromGroup(['WOOLWORTHS 1234 SYDNEY', 'WOOLWORTHS 9999 MELB'])).toBe(
      'WOOLWORTHS'
    );
  });

  it('falls back to a meaningful token when prefix is short', () => {
    expect(descriptionPatternFromGroup(['A B', 'X Y'])).toMatch(/^[ABXY]/);
  });
});

describe('computeLearnableTags', () => {
  it('returns tags added after baseline', () => {
    const tx = [
      { checksum: 'a', description: 'x', amount: 1, account: 'c', rawRow: '{}', tags: ['Fuel'] },
    ] as const;
    const initial = { a: ['Fuel'] };
    const local = { a: ['Fuel', 'Coffee'] };
    expect(computeLearnableTags([...tx], local, initial)).toEqual(['Coffee']);
  });
});
