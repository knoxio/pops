import { describe, expect, it } from 'vitest';

import { parseYield } from '../handlers/web/parse-yield.js';

describe('parseYield', () => {
  it('parses "4 servings"', () => {
    expect(parseYield('4 servings')).toEqual({ qty: 4, unit: 'serving' });
  });

  it('parses "24 cookies"', () => {
    expect(parseYield('24 cookies')).toEqual({ qty: 24, unit: 'cookies' });
  });

  it('parses "4-6 servings" → first integer', () => {
    expect(parseYield('4-6 servings')).toEqual({ qty: 4, unit: 'serving' });
  });

  it('parses bare integer', () => {
    expect(parseYield(8)).toEqual({ qty: 8, unit: 'serving' });
  });

  it('parses bare integer string', () => {
    expect(parseYield('8')).toEqual({ qty: 8, unit: 'serving' });
  });

  it('parses array → picks first string', () => {
    expect(parseYield(['6 servings', '4 burgers'])).toEqual({ qty: 6, unit: 'serving' });
  });

  it('falls back to (4, serving) when unparseable', () => {
    expect(parseYield('a bunch')).toEqual({ qty: 4, unit: 'serving' });
  });

  it('falls back to (4, serving) on undefined', () => {
    expect(parseYield(undefined)).toEqual({ qty: 4, unit: 'serving' });
  });
});
