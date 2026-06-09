import { describe, expect, it } from 'vitest';

import { buildRenumberPlan, RenumberPermutationError, scanIngredientUsages } from '../renumber';

const TRIVIAL = [
  '@recipe(slug="x", title="X")',
  '@yield(x, 1:count)',
  '@ingredient(1, salt, 1:g)',
  '@ingredient(2, sugar, 2:g)',
  '@ingredient(3, water, 100:ml)',
  '@step("Mix @1, @2, and @3 well.")',
].join('\n\n');

describe('scanIngredientUsages', () => {
  it('finds all @ingredient declarations with current indices and labels', () => {
    const result = scanIngredientUsages(TRIVIAL);
    expect(result.declarations).toHaveLength(3);
    expect(result.declarations.map((d) => d.currentIndex)).toEqual([1, 2, 3]);
    expect(result.declarations.map((d) => d.label)).toEqual(['salt', 'sugar', 'water']);
  });

  it('finds all @N refs inside @step bodies, in document order', () => {
    const result = scanIngredientUsages(TRIVIAL);
    expect(result.stepRefs.map((r) => r.currentIndex)).toEqual([1, 2, 3]);
  });

  it('ignores slug refs (@banana), @time, @temperature inside step bodies', () => {
    const src = '@step("Squeeze @banana, wait @time(5:min) at @temperature(180:c).")';
    const result = scanIngredientUsages(src);
    expect(result.stepRefs).toHaveLength(0);
  });

  it('honours escaped quotes inside step body strings', () => {
    const src = '@step("Say \\"@1 first\\" then @2.")';
    const result = scanIngredientUsages(src);
    expect(result.stepRefs.map((r) => r.currentIndex)).toEqual([1, 2]);
  });

  it('does not run off the end on an unclosed step string', () => {
    const src = '@step("partial @1 and';
    const result = scanIngredientUsages(src);
    expect(result.declarations).toHaveLength(0);
    expect(result.stepRefs).toHaveLength(0);
  });

  it('captures multi-digit indices', () => {
    const src = '@ingredient(12, salt, 1:g)\n@step("Use @12 here.")';
    const result = scanIngredientUsages(src);
    expect(result.declarations[0]?.currentIndex).toBe(12);
    expect(result.stepRefs[0]?.currentIndex).toBe(12);
  });

  it('captures variant + prep descriptor in label', () => {
    const src = '@ingredient(1, salt:flake:rough, 1:g)';
    const result = scanIngredientUsages(src);
    expect(result.declarations[0]?.label).toBe('salt:flake:rough');
  });

  it('parses multi-line @ingredient calls (named args)', () => {
    const src = '@ingredient(\n  1,\n  salt,\n  qty=2:g,\n  notes="kosher"\n)';
    const result = scanIngredientUsages(src);
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]?.currentIndex).toBe(1);
  });

  it('ignores @ingredient(...) text that appears inside a // comment', () => {
    const src = [
      '// see @ingredient(99, fake, 1:g) — historical note',
      '@ingredient(1, salt, 1:g)',
    ].join('\n');
    const result = scanIngredientUsages(src);
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]?.currentIndex).toBe(1);
  });

  it('ignores @ingredient(...) text that appears inside a string literal', () => {
    const src = [
      '@recipe(slug="x", title="add @ingredient(99, fake, 1:g) later")',
      '@ingredient(1, salt, 1:g)',
    ].join('\n');
    const result = scanIngredientUsages(src);
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]?.currentIndex).toBe(1);
  });

  it('drops @ingredient declarations whose call never closes', () => {
    const src = '@ingredient(1, salt, 1:g\n@ingredient(2, sugar, 2:g)';
    const result = scanIngredientUsages(src);
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]?.currentIndex).toBe(2);
  });

  it('records blockEnd just past the matching closing paren', () => {
    const src = '@ingredient(1, salt, 1:g)\n';
    const decl = scanIngredientUsages(src).declarations[0];
    expect(decl).toBeDefined();
    expect(src.slice(decl?.blockStart, decl?.blockEnd)).toBe('@ingredient(1, salt, 1:g)');
  });
});

describe('buildRenumberPlan — identity case', () => {
  it('emits zero changes when permutation is identity AND indices already 1..N', () => {
    const plan = buildRenumberPlan(TRIVIAL, [0, 1, 2]);
    expect(plan.changes).toEqual([]);
    expect(plan.newSource).toBe(TRIVIAL);
    expect(plan.indexRewrites.size).toBe(0);
  });
});

describe('buildRenumberPlan — renumber-only (no movement)', () => {
  it('renumbers gappy indices to 1..N in place', () => {
    const src = [
      '@ingredient(5, salt, 1:g)',
      '@ingredient(9, sugar, 2:g)',
      '@step("Mix @5 with @9.")',
    ].join('\n');
    const plan = buildRenumberPlan(src, [0, 1]);
    expect(plan.indexRewrites.get(5)).toBe(1);
    expect(plan.indexRewrites.get(9)).toBe(2);
    expect(plan.newSource).toBe(
      ['@ingredient(1, salt, 1:g)', '@ingredient(2, sugar, 2:g)', '@step("Mix @1 with @2.")'].join(
        '\n'
      )
    );
  });

  it('leaves declarations whose currentIndex already matches their slot alone', () => {
    const src = '@ingredient(1, a, 1:g)\n@ingredient(99, b, 2:g)\n@step("@1 @99")';
    const plan = buildRenumberPlan(src, [0, 1]);
    expect(plan.indexRewrites.has(1)).toBe(false);
    expect(plan.indexRewrites.get(99)).toBe(2);
    expect(plan.newSource).toBe('@ingredient(1, a, 1:g)\n@ingredient(2, b, 2:g)\n@step("@1 @2")');
  });
});

describe('buildRenumberPlan — reorder', () => {
  it('swaps two ingredients and rewrites step refs accordingly', () => {
    const plan = buildRenumberPlan(TRIVIAL, [1, 0, 2]);
    expect(plan.newSource).toContain('@ingredient(1, sugar, 2:g)');
    expect(plan.newSource).toContain('@ingredient(2, salt, 1:g)');
    expect(plan.newSource).toContain('@ingredient(3, water, 100:ml)');
    expect(plan.newSource).toContain('Mix @2, @1, and @3 well.');
  });

  it('reverses the list', () => {
    const plan = buildRenumberPlan(TRIVIAL, [2, 1, 0]);
    expect(plan.newSource).toContain('@ingredient(1, water, 100:ml)');
    expect(plan.newSource).toContain('@ingredient(2, sugar, 2:g)');
    expect(plan.newSource).toContain('@ingredient(3, salt, 1:g)');
    expect(plan.newSource).toContain('Mix @3, @2, and @1 well.');
  });

  it('preserves multi-line declaration formatting when moving', () => {
    const src = ['@ingredient(\n  1,\n  salt,\n  qty=1:g\n)', '@ingredient(2, sugar, 2:g)'].join(
      '\n\n'
    );
    const plan = buildRenumberPlan(src, [1, 0]);
    expect(plan.newSource).toContain('@ingredient(1, sugar, 2:g)');
    expect(plan.newSource).toContain('@ingredient(\n  2,\n  salt,\n  qty=1:g\n)');
  });

  it('preserves text between blocks at its original position', () => {
    const src = [
      '@ingredient(1, salt, 1:g)',
      '// note about dry pantry items',
      '@ingredient(2, sugar, 2:g)',
      '',
      '// wet ingredients below',
      '@ingredient(3, water, 100:ml)',
    ].join('\n');
    const plan = buildRenumberPlan(src, [2, 0, 1]);
    expect(plan.newSource).toContain('// note about dry pantry items');
    expect(plan.newSource).toContain('// wet ingredients below');
    expect(plan.newSource.indexOf('// note about dry')).toBeLessThan(
      plan.newSource.indexOf('// wet ingredients')
    );
  });
});

describe('buildRenumberPlan — step ref edge cases', () => {
  it('does not rewrite slug refs (@banana) when ingredient indices change', () => {
    const src = [
      '@ingredient(2, salt, 1:g)',
      '@ingredient(1, sugar, 2:g)',
      '@step("Add @salt and @1 to taste.")',
    ].join('\n');
    const plan = buildRenumberPlan(src, [0, 1]);
    expect(plan.newSource).toContain('@step("Add @salt and @2 to taste.")');
  });

  it('does not touch @N when N has no matching declaration', () => {
    const src = '@ingredient(1, salt, 1:g)\n@step("Use @1 then @99.")';
    const plan = buildRenumberPlan(src, [0]);
    expect(plan.newSource).toContain('@1 then @99');
  });

  it('does not rewrite @time or @temperature calls', () => {
    const src = [
      '@ingredient(5, water, 1:ml)',
      '@step("Boil for @time(5:min) at @temperature(100:c) then add @5.")',
    ].join('\n');
    const plan = buildRenumberPlan(src, [0]);
    expect(plan.newSource).toContain('@time(5:min)');
    expect(plan.newSource).toContain('@temperature(100:c)');
    expect(plan.newSource).toContain('add @1.');
  });

  it('handles multi-digit index rewrites correctly', () => {
    const src = '@ingredient(12, salt, 1:g)\n@step("Use @12 not @1.")';
    const plan = buildRenumberPlan(src, [0]);
    expect(plan.newSource).toContain('@ingredient(1, salt, 1:g)');
    expect(plan.newSource).toContain('Use @1 not @1.');
  });
});

describe('buildRenumberPlan — emitted changes are CodeMirror-safe', () => {
  it('returns changes sorted ascending by `from`, non-overlapping', () => {
    const plan = buildRenumberPlan(TRIVIAL, [2, 0, 1]);
    let cursor = -1;
    for (const change of plan.changes) {
      expect(change.from).toBeGreaterThanOrEqual(cursor);
      expect(change.to).toBeGreaterThanOrEqual(change.from);
      cursor = change.to;
    }
    expect(plan.changes.length).toBeGreaterThan(0);
  });

  it('applying the changes manually yields the same newSource', () => {
    const plan = buildRenumberPlan(TRIVIAL, [2, 0, 1]);
    let out = '';
    let cursor = 0;
    for (const change of plan.changes) {
      out += TRIVIAL.slice(cursor, change.from) + change.insert;
      cursor = change.to;
    }
    out += TRIVIAL.slice(cursor);
    expect(out).toBe(plan.newSource);
  });
});

describe('buildRenumberPlan — invalid input', () => {
  it('throws when permutation length does not match declaration count', () => {
    expect(() => buildRenumberPlan(TRIVIAL, [0, 1])).toThrow(RenumberPermutationError);
  });

  it('throws on duplicate indices in permutation', () => {
    expect(() => buildRenumberPlan(TRIVIAL, [0, 0, 1])).toThrow(RenumberPermutationError);
  });

  it('throws on out-of-range index in permutation', () => {
    expect(() => buildRenumberPlan(TRIVIAL, [0, 1, 9])).toThrow(RenumberPermutationError);
  });

  it('throws on non-integer permutation values', () => {
    expect(() => buildRenumberPlan(TRIVIAL, [0, 1, 2.5])).toThrow(RenumberPermutationError);
  });
});

describe('buildRenumberPlan — empty document', () => {
  it('is a no-op when there are no declarations', () => {
    const src = '@recipe(slug="x", title="X")\n@yield(x, 1:count)';
    const plan = buildRenumberPlan(src, []);
    expect(plan.changes).toEqual([]);
    expect(plan.newSource).toBe(src);
  });
});

describe('buildRenumberPlan — duplicate currentIndex (broken doc)', () => {
  it('keeps the first mapping and renumbers without crashing', () => {
    const src = ['@ingredient(1, salt, 1:g)', '@ingredient(1, sugar, 2:g)'].join('\n');
    const plan = buildRenumberPlan(src, [1, 0]);
    expect(plan.newSource).toContain('@ingredient(1, sugar, 2:g)');
    expect(plan.newSource).toContain('@ingredient(2, salt, 1:g)');
  });
});

describe('buildRenumberPlan — unclosed declarations are dropped, never overlap', () => {
  it('plans only against declarations whose call closes', () => {
    const src = [
      '@ingredient(1, salt, 1:g',
      '@ingredient(2, sugar, 2:g',
      '@ingredient(3, water, 100:ml)',
    ].join('\n');
    const plan = buildRenumberPlan(src, [0]);
    expect(plan.newSource).toContain('@ingredient(1, water, 100:ml)');
    expect(plan.changes.every((c) => c.to >= c.from)).toBe(true);
  });
});
