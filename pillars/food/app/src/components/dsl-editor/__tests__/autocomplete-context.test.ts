/**
 * Cursor-context classifier — unit suite.
 *
 * The classifier is the single brain that decides which autocomplete
 * source to fire for a given (document, cursor) pair. The cursor-position
 * → source matrix lives in pillars/food/docs/prds/dsl-editor; this suite
 * has one `it` per row, plus negatives (cursor in a position that should
 * NOT surface a popup).
 */
import { describe, expect, it } from 'vitest';

import { classifyCursor } from '../autocomplete-context';

function cursorAt(text: string): { text: string; pos: number } {
  const pos = text.indexOf('|');
  if (pos === -1) throw new Error('test fixture missing cursor marker "|"');
  return { text: text.slice(0, pos) + text.slice(pos + 1), pos };
}

describe('classifyCursor', () => {
  it('returns none for an empty document', () => {
    expect(classifyCursor('', 0)).toEqual({ kind: 'none' });
  });

  it('returns none mid-prose with no cursor handle', () => {
    expect(classifyCursor('Some markdown body text.', 12)).toEqual({ kind: 'none' });
  });

  describe('function name after bare @', () => {
    it('classifies a bare @ as function-name', () => {
      const { text, pos } = cursorAt('@|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'function-name', from: 0, query: '' });
    });

    it('classifies @rec as function-name with the typed prefix', () => {
      const { text, pos } = cursorAt('@rec|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'function-name', from: 0, query: 'rec' });
    });
  });

  describe('descriptor slug inside @ingredient / @yield', () => {
    it('classifies the first character after @ingredient(N, as a slug query', () => {
      const { text, pos } = cursorAt('@ingredient(1, |');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'descriptor-slug', from: pos, query: '' });
    });

    it('classifies a typed prefix after @ingredient(N, ', () => {
      const { text, pos } = cursorAt('@ingredient(1, ban|');
      const ctx = classifyCursor(text, pos);
      expect(ctx.kind).toBe('descriptor-slug');
      expect(ctx).toMatchObject({ kind: 'descriptor-slug', query: 'ban' });
    });

    it('classifies the first arg of @yield as a slug', () => {
      const { text, pos } = cursorAt('@yield(ban|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toMatchObject({ kind: 'descriptor-slug', query: 'ban' });
    });
  });

  describe('descriptor variant after slug:', () => {
    it('classifies @ingredient(N, banana:| as variant of banana', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana:|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({
        kind: 'descriptor-variant',
        from: pos,
        query: '',
        ingredientSlug: 'banana',
      });
    });

    it('keeps the variant query as the user types', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana:ra|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toMatchObject({
        kind: 'descriptor-variant',
        ingredientSlug: 'banana',
        query: 'ra',
      });
    });
  });

  describe('descriptor prep state after slug:variant:', () => {
    it('classifies @ingredient(N, banana:raw:| as prep state', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana:raw:|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'descriptor-prep', from: pos, query: '' });
    });

    it('classifies with `_` skip marker in the variant slot', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana:_:di|');
      const ctx = classifyCursor(text, pos);
      // `_` is itself an identifier-shaped value to the segment splitter
      // but the autocomplete still surfaces prep states because we're in
      // the third segment.
      expect(ctx).toMatchObject({ kind: 'descriptor-prep', query: 'di' });
    });
  });

  describe('unit after qty:', () => {
    it('classifies after a bare colon following digits', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana:raw, 100:|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'unit', from: pos, query: '' });
    });

    it('classifies with a typed unit prefix', () => {
      const { text, pos } = cursorAt('@yield(beef, 500:g|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'unit', from: pos - 1, query: 'g' });
    });

    it('accepts decimal qty values', () => {
      const { text, pos } = cursorAt('@yield(milk, 1.5:|');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'unit', from: pos, query: '' });
    });
  });

  describe('step body @N references', () => {
    it('classifies a bare @ inside a step body as step-ref', () => {
      const { text, pos } = cursorAt('@step("Mash the @|");');
      const ctx = classifyCursor(text, pos);
      expect(ctx.kind).toBe('step-ref');
    });

    it('captures the typed query (digit or slug)', () => {
      const { text, pos } = cursorAt('@step("Mash the @ban|");');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toMatchObject({ kind: 'step-ref', query: 'ban' });
    });

    it('captures numeric step-ref query', () => {
      const { text, pos } = cursorAt('@step("Mash @1|");');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toMatchObject({ kind: 'step-ref', query: '1' });
    });

    it('honours escaped quotes inside the step body', () => {
      const { text, pos } = cursorAt('@step("She said \\"add @s|\\"")');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toMatchObject({ kind: 'step-ref', query: 's' });
    });

    it('returns none when the cursor sits outside any @ in a step body', () => {
      const { text, pos } = cursorAt('@step("plain text |here");');
      const ctx = classifyCursor(text, pos);
      expect(ctx).toEqual({ kind: 'none' });
    });
  });

  describe('negatives', () => {
    it('does not classify @ inside a closed function call', () => {
      const { text, pos } = cursorAt('@ingredient(1, banana, 100:g)\n@|');
      const ctx = classifyCursor(text, pos);
      // Cursor at the top-level @ is a function-name; this is correct.
      expect(ctx.kind).toBe('function-name');
    });

    it('does not surface unit context for `foo:` (alpha-keyed)', () => {
      const { text, pos } = cursorAt('@ingredient(1, foo:|');
      const ctx = classifyCursor(text, pos);
      // The trailing `foo:` looks like a descriptor variant, not a qty:unit.
      expect(ctx.kind).toBe('descriptor-variant');
    });
  });
});
