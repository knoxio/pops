/**
 * Unit tests for the chip scanner.
 *
 * Pure function — no DOM, no CodeMirror. Each case asserts on the chip
 * offsets and the `index → declaration` map directly.
 */
import { describe, expect, it } from 'vitest';

import { scanForChips } from '../chip-scanner';

function snippet(text: string, from: number, to: number): string {
  return text.slice(from, to);
}

describe('scanForChips', () => {
  it('returns no chips for a document without @step bodies', () => {
    const source = '@recipe(slug="x", title="X")\n@yield(x, 1:count)\n';
    const result = scanForChips(source);
    expect(result.chips).toEqual([]);
    expect(result.declarations.size).toBe(0);
  });

  it('builds an index → declaration map from @ingredient calls', () => {
    const source = [
      '@recipe(slug="x", title="X")',
      '@yield(x, 1:count)',
      '@ingredient(1, banana:raw, 100:g)',
      '@ingredient(2, flank:braised:shredded, 200:g)',
    ].join('\n');
    const result = scanForChips(source);
    expect(result.declarations.get(1)).toMatchObject({ index: 1, slug: 'banana', variant: 'raw' });
    expect(result.declarations.get(2)).toMatchObject({
      index: 2,
      slug: 'flank',
      variant: 'braised',
      prep: 'shredded',
    });
  });

  it('detects @N index refs inside step bodies', () => {
    const source = '@step("Mash the @1 in a bowl")';
    const result = scanForChips(source);
    expect(result.chips).toHaveLength(1);
    const chip = result.chips[0];
    expect(chip?.kind).toBe('ref-index');
    if (chip?.kind === 'ref-index') {
      expect(chip.index).toBe(1);
      expect(snippet(source, chip.from, chip.to)).toBe('@1');
    }
  });

  it('detects @slug refs inside step bodies', () => {
    const source = '@step("Garnish with @cilantro and stir")';
    const result = scanForChips(source);
    const slug = result.chips.find((c) => c.kind === 'ref-slug');
    expect(slug?.kind).toBe('ref-slug');
    if (slug?.kind === 'ref-slug') {
      expect(slug.slug).toBe('cilantro');
      expect(snippet(source, slug.from, slug.to)).toBe('@cilantro');
    }
  });

  it('detects @time and @temperature calls inside step bodies', () => {
    const source = '@step("Rest @time(20:min) at @temperature(180:c)")';
    const result = scanForChips(source);
    const time = result.chips.find((c) => c.kind === 'time');
    const temp = result.chips.find((c) => c.kind === 'temperature');
    expect(time?.kind).toBe('time');
    expect(temp?.kind).toBe('temperature');
    if (time?.kind === 'time') {
      expect(time.qty).toBe(20);
      expect(time.unit).toBe('min');
      expect(snippet(source, time.from, time.to)).toBe('@time(20:min)');
    }
    if (temp?.kind === 'temperature') {
      expect(temp.qty).toBe(180);
      expect(temp.unit).toBe('c');
    }
  });

  it('does NOT match @N or @slug outside @step bodies', () => {
    const source = '@ingredient(1, banana:raw, 100:g)\n@2 something\n@apple';
    const result = scanForChips(source);
    expect(result.chips).toEqual([]);
  });

  it('handles escaped quotes inside the step body string', () => {
    const source = '@step("Quote \\"@1\\" mid-string then @2 ends")';
    const result = scanForChips(source);
    const indexes = result.chips.filter((c) => c.kind === 'ref-index');
    expect(indexes).toHaveLength(2);
    expect(indexes.map((c) => (c.kind === 'ref-index' ? c.index : -1))).toEqual([1, 2]);
  });

  it('survives unterminated @step body without throwing', () => {
    const source = '@step("Mash the @1 in a bowl';
    expect(() => scanForChips(source)).not.toThrow();
    expect(scanForChips(source).chips).toEqual([]);
  });

  it('records callStart at the @ character of @ingredient declarations', () => {
    const source = 'prologue\n@ingredient(1, banana:raw, 100:g)\n';
    const result = scanForChips(source);
    const decl = result.declarations.get(1);
    expect(decl).toBeDefined();
    if (decl) {
      expect(source[decl.callStart]).toBe('@');
      expect(source.slice(decl.callStart, decl.callStart + 11)).toBe('@ingredient');
    }
  });

  it('suppresses false-positive chips inside an unterminated unknown @func( call', () => {
    // Mid-edit case: user typed `@bad(` and the paren never closes inside
    // the step body. The scanner must not still emit chips for `@1` or
    // `@cilantro` that fall inside the unterminated call's text.
    const source = '@step("Use @bad(@1 and @cilantro never closes")';
    const result = scanForChips(source);
    expect(result.chips.filter((c) => c.kind === 'ref-index')).toHaveLength(0);
    expect(result.chips.filter((c) => c.kind === 'ref-slug')).toHaveLength(0);
  });

  it('ignores @<func>( whose name is not in the inline-func allow-list', () => {
    const source = '@step("Skip @notafunc(1:g) but keep @time(5:min)")';
    const result = scanForChips(source);
    const time = result.chips.find((c) => c.kind === 'time');
    const slugs = result.chips.filter((c) => c.kind === 'ref-slug');
    expect(time).toBeDefined();
    // `notafunc` should not produce a slug chip — the scanner consumes the
    // `(...)` block so it doesn't degrade into a partial slug match either.
    expect(slugs).toHaveLength(0);
  });
});
