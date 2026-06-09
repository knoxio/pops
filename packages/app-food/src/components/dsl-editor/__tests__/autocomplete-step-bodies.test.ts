/**
 * Step-body scanner — unit suite (PRD-120 part B).
 *
 * Covers `findStepBodyAtOffset` (membership test for the cursor) and
 * `collectStepIndexes` (the index → descriptor map that feeds step-ref
 * autocomplete). Both functions are pure string walkers — tests just
 * exercise the matrix of grammar shapes the user can type during a
 * recipe edit.
 */
import { describe, expect, it } from 'vitest';

import { collectStepIndexes, findStepBodyAtOffset } from '../autocomplete-step-bodies';

describe('findStepBodyAtOffset', () => {
  it('returns null when there is no step call', () => {
    expect(findStepBodyAtOffset('@recipe(slug="x")', 5)).toBeNull();
  });

  it('returns the body offsets when the cursor sits inside a step body', () => {
    const text = '@step("Mash the banana.")';
    const cursor = text.indexOf('banana');
    const result = findStepBodyAtOffset(text, cursor);
    expect(result).not.toBeNull();
    expect(result?.bodyStart).toBe(text.indexOf('"') + 1);
  });

  it('returns null when the cursor sits after the closing quote', () => {
    const text = '@step("done") next call';
    const cursor = text.length;
    expect(findStepBodyAtOffset(text, cursor)).toBeNull();
  });

  it('returns null when the cursor sits before the opening quote', () => {
    const text = '@step("done")';
    const cursor = text.indexOf('@step');
    expect(findStepBodyAtOffset(text, cursor)).toBeNull();
  });

  it('honours \\" escapes inside the body', () => {
    const text = '@step("She said \\"go\\"") next';
    const cursor = text.indexOf('go');
    const result = findStepBodyAtOffset(text, cursor);
    expect(result).not.toBeNull();
  });

  it('treats an unterminated body as open to EOF', () => {
    const text = '@step("the user is still typing';
    const cursor = text.length;
    const result = findStepBodyAtOffset(text, cursor);
    expect(result).not.toBeNull();
    expect(result?.bodyEnd).toBe(text.length);
  });

  it('returns the most recent step body when multiple exist', () => {
    const text = '@step("first")\n@step("second |here")';
    const cursor = text.indexOf('|');
    const result = findStepBodyAtOffset(text.replace('|', ''), cursor);
    expect(result).not.toBeNull();
    expect(result?.bodyStart).toBeGreaterThan(text.indexOf('"second'));
  });

  it('does not match `@stepper(` as a step call (identifier-boundary check)', () => {
    const text = '@stepper(@cilantro)';
    expect(findStepBodyAtOffset(text, 12)).toBeNull();
  });

  it('does not treat an `@step("...")` literal nested inside another step body as a step call', () => {
    // Cursor sits inside the OUTER step body. The inner literal text
    // `@step("inner ...")` lives inside the outer string; the scanner
    // must skip string contents so it doesn't latch onto the inner
    // string as a real step call.
    const text = '@step("the user pasted @step(\\"inner @1\\") into the body |here")';
    const cursor = text.indexOf('|');
    const cleaned = text.replace('|', '');
    const result = findStepBodyAtOffset(cleaned, cursor);
    expect(result).not.toBeNull();
    // The outer body starts right after the first `"`.
    expect(result?.bodyStart).toBe(cleaned.indexOf('"') + 1);
  });
});

describe('collectStepIndexes', () => {
  it('returns nothing when there are no ingredient calls', () => {
    expect(collectStepIndexes('@recipe(slug="x")')).toEqual([]);
  });

  it('captures the index and descriptor head', () => {
    const text = '@ingredient(1, banana, 100:g)\n@ingredient(2, oil:olive, 10:ml)';
    expect(collectStepIndexes(text)).toEqual([
      { index: '1', slug: 'banana' },
      { index: '2', slug: 'oil:olive' },
    ]);
  });

  it('deduplicates repeated indexes (keep the first)', () => {
    const text = '@ingredient(1, banana, 100:g)\n@ingredient(1, beef, 200:g)';
    expect(collectStepIndexes(text)).toEqual([{ index: '1', slug: 'banana' }]);
  });

  it('sorts numerically even when declaration order is out-of-order', () => {
    const text =
      '@ingredient(3, c, 1:count)\n@ingredient(1, a, 1:count)\n@ingredient(2, b, 1:count)';
    expect(collectStepIndexes(text).map((e) => e.index)).toEqual(['1', '2', '3']);
  });

  it('ignores malformed lines (no descriptor)', () => {
    const text = '@ingredient(1,)\n@ingredient(2, valid, 1:g)';
    expect(collectStepIndexes(text)).toEqual([{ index: '2', slug: 'valid' }]);
  });

  it('ignores `@ingredient(...)` text that appears inside a `@step("...")` body', () => {
    // The user typed `@ingredient(9, ...)` as a recipe-prose snippet
    // inside the step body — those should not surface as step-ref
    // suggestions because the document only declares index 1.
    const text = [
      '@ingredient(1, banana, 100:g)',
      '@step("She said: @ingredient(9, beans, 200:g)")',
    ].join('\n');
    expect(collectStepIndexes(text)).toEqual([{ index: '1', slug: 'banana' }]);
  });
});
