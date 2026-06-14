import { describe, expect, it } from 'vitest';

import { financeManifest } from '../settings/index.js';

describe('financeManifest', () => {
  it('loads with the canonical id', () => {
    expect(financeManifest.id).toBe('finance');
  });
});
