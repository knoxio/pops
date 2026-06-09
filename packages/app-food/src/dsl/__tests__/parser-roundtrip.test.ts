/**
 * PRD-114 — round-trip stability + perf tests.
 *
 * Round-trip: parse → print → parse → assert AST equality (ignoring `loc`).
 * Perf: 200-line generated recipe parses in <50ms (soft target — a regression
 * triggers profiling, not a build failure).
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '../parser.js';
import { printRecipeAst } from '../printer.js';
import { ALL_SAMPLES } from './samples.js';

import type { RecipeAst } from '../ast.js';

function stripLoc<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripLoc(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'loc') continue;
      out[k] = stripLoc(v);
    }
    return out as T;
  }
  return value;
}

describe('PRD-114 — round-trip stability', () => {
  it.each(ALL_SAMPLES)('parse → print → parse is stable for %s', (_label, src) => {
    const r1 = parseRecipeDsl(src);
    if (!r1.ok) throw new Error(`parse1 failed: ${r1.errors.map((e) => e.code).join(', ')}`);
    const printed = printRecipeAst(r1.ast);
    const r2 = parseRecipeDsl(printed);
    if (!r2.ok) {
      throw new Error(
        `parse2 of printed output failed:\n${printed}\nerrors:\n${r2.errors
          .map((e) => `  ${e.code}: ${e.message} @ ${e.loc.startLine}:${e.loc.startCol}`)
          .join('\n')}`
      );
    }
    expect(stripLoc<RecipeAst>(r2.ast)).toEqual(stripLoc<RecipeAst>(r1.ast));
  });
});

describe('PRD-114 — performance', () => {
  it('parses a 200-line recipe in <50ms', () => {
    const lines: string[] = [
      '@recipe(slug="big", title="Big recipe", servings=4)',
      '@yield(big-out, 1:count)',
    ];
    // Pad to ~200 lines with alternating ingredient/step blocks.
    for (let i = 1; i <= 100; i += 1) {
      lines.push(`@ingredient(${i}, ingredient-${i}, ${i * 10}:g)`);
      lines.push(`@step("Combine @${i} with @${Math.max(1, i - 1)} for @time(${i}:s).")`);
    }
    const src = lines.join('\n');
    expect(src.split('\n').length).toBeGreaterThanOrEqual(200);

    // Warm up + measure.
    parseRecipeDsl(src);
    const t0 = performance.now();
    const r = parseRecipeDsl(src);
    const elapsed = performance.now() - t0;
    if (!r.ok) throw new Error(`parse failed: ${r.errors[0]?.code}`);
    expect(elapsed).toBeLessThan(50);
  });
});
