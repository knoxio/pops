/**
 * PRD-130 — caption-heuristic boundary tests.
 */
import { describe, expect, it } from 'vitest';

import { isStructuredCaption } from '../handlers/instagram/caption-heuristic.js';

describe('isStructuredCaption', () => {
  it('returns false for null', () => {
    expect(isStructuredCaption(null)).toBe(false);
  });

  it('returns false for short captions', () => {
    expect(isStructuredCaption('Yum!')).toBe(false);
  });

  it('returns true when bullets + measurement units appear', () => {
    const caption = [
      'Weeknight pancakes',
      '- 2 cups flour',
      '- 1 tbsp baking powder',
      '- 1 tsp salt',
      '- 1 cup milk',
      '- 2 tbsp butter',
      'Whisk dry. Whisk wet. Cook on a hot pan.',
    ].join('\n');
    expect(isStructuredCaption(caption)).toBe(true);
  });

  it('returns true when ingredients + steps headers appear together', () => {
    const caption = ['INGREDIENTS', 'Whatever you have', 'METHOD', 'Cook it']
      .join('\n')
      .padEnd(120, 'x');
    expect(isStructuredCaption(caption)).toBe(true);
  });

  it('returns false when bullets are present but no measurement units', () => {
    const caption = [
      'My thoughts on dinner',
      '- It was good',
      '- It was filling',
      '- I ate too much',
      '- The dog stared at me',
      '- Bedtime now',
    ].join('\n');
    expect(isStructuredCaption(caption)).toBe(false);
  });

  it('returns false when measurement units appear but no bullets and no headers', () => {
    const caption =
      'I cooked some pasta tonight with 200g of penne and 100ml of sauce. It was nice.';
    expect(isStructuredCaption(caption)).toBe(false);
  });
});
