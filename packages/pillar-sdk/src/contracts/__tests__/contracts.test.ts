import { describe, expectTypeOf, it } from 'vitest';

import type { FinanceContract } from '../index.js';

describe('pillar-sdk/contracts', () => {
  it('re-exports FinanceContract with a pillar property', () => {
    expectTypeOf<FinanceContract>().toHaveProperty('pillar');
  });
});
