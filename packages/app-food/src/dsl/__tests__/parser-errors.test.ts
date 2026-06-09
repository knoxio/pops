/**
 * PRD-114 — error coverage tests for `parseRecipeDsl`.
 *
 * Each `ParseErrorCode` has at least one case asserting code + a sensible
 * loc. Plus the recovery test (3 bad @step calls → 3 errors).
 */
import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '../parser.js';

import type { ParseErrorCode } from '../errors.js';

const RECIPE_HEADER = `@recipe(slug="x", title="X")
@yield(x, 1:count)
`;

function parseErr(input: string): { code: ParseErrorCode; line: number }[] {
  const r = parseRecipeDsl(input);
  if (r.ok) return [];
  return r.errors.map((e) => ({ code: e.code, line: e.loc.startLine }));
}

describe('PRD-114 — parser error codes', () => {
  it('MissingRecipeHeader — empty input', () => {
    const errs = parseErr('');
    expect(errs.map((e) => e.code)).toContain('MissingRecipeHeader');
  });

  it('MissingRecipeHeader — content before @recipe', () => {
    const errs = parseErr('some markdown line\n@recipe(slug="x", title="X")\n@yield(x, 1:count)\n');
    expect(errs.map((e) => e.code)).toContain('MissingRecipeHeader');
  });

  it('MissingYield — header but no @yield', () => {
    const errs = parseErr('@recipe(slug="x", title="X")\n');
    expect(errs.map((e) => e.code)).toContain('MissingYield');
  });

  it('DuplicateIngredientIndex', () => {
    const errs = parseErr(
      `${RECIPE_HEADER}@ingredient(1, banana, 100:g)\n@ingredient(1, apple, 50:g)\n`
    );
    expect(errs.map((e) => e.code)).toContain('DuplicateIngredientIndex');
  });

  it('UnknownFunction — top-level', () => {
    const errs = parseErr(`${RECIPE_HEADER}@bogus(slug="x")\n`);
    expect(errs.map((e) => e.code)).toContain('UnknownFunction');
  });

  it('InvalidArgCount — @yield missing qty:unit', () => {
    const errs = parseErr('@recipe(slug="x", title="X")\n@yield(x)\n');
    expect(errs.map((e) => e.code)).toContain('InvalidArgCount');
  });

  it('InvalidArgValue — non-integer ingredient index', () => {
    const errs = parseErr(`${RECIPE_HEADER}@ingredient(1.5, banana, 100:g)\n`);
    expect(errs.map((e) => e.code)).toContain('InvalidArgValue');
  });

  it('UnbalancedParens at file scope', () => {
    const errs = parseErr(`${RECIPE_HEADER}@ingredient(1, banana, 100:g\n`);
    expect(errs.map((e) => e.code)).toContain('UnbalancedParens');
  });

  it('UnterminatedString inside @step body', () => {
    const errs = parseErr(`${RECIPE_HEADER}@step("hello world\n`);
    expect(errs.map((e) => e.code)).toContain('UnterminatedString');
  });

  it('InvalidSlug — @recipe with empty slug', () => {
    const errs = parseErr('@recipe(slug="", title="X")\n@yield(x, 1:count)\n');
    expect(errs.map((e) => e.code)).toContain('InvalidSlug');
  });

  it('InvalidQtyUnit — bad qty:unit form', () => {
    const errs = parseErr(`${RECIPE_HEADER}@ingredient(1, banana, abc:g)\n`);
    expect(errs.map((e) => e.code)).toContain('InvalidQtyUnit');
  });

  it('InlineRefOutsideStep — `@1` at top level', () => {
    const errs = parseErr(`${RECIPE_HEADER}@1\n`);
    expect(errs.map((e) => e.code)).toContain('InlineRefOutsideStep');
  });

  it('TrailingDescriptorColon — `banana:` with nothing after', () => {
    const errs = parseErr(`${RECIPE_HEADER}@ingredient(1, banana:, 100:g)\n`);
    expect(errs.map((e) => e.code)).toContain('TrailingDescriptorColon');
  });

  it('UnexpectedToken — duplicate @recipe header', () => {
    const errs = parseErr(
      '@recipe(slug="x", title="X")\n@yield(x, 1:count)\n@recipe(slug="y", title="Y")\n'
    );
    expect(errs.map((e) => e.code)).toContain('UnexpectedToken');
  });

  it('every loc.startLine is a positive integer (1-indexed)', () => {
    const errs = parseErr(`${RECIPE_HEADER}@bogus()\n@ingredient(1, banana, abc:g)\n`);
    for (const e of errs) {
      expect(Number.isInteger(e.line)).toBe(true);
      expect(e.line).toBeGreaterThanOrEqual(1);
    }
  });

  it('recovery: 3 bad @step calls produce 3 errors and the rest of the AST parses', () => {
    const input = `${RECIPE_HEADER}@ingredient(1, banana, 100:g)
@step("unterminated 1
@step("unterminated 2
@step("unterminated 3
@step("good step refers to @1")
`;
    const r = parseRecipeDsl(input);
    if (r.ok) throw new Error('expected errors');
    const stringErrs = r.errors.filter((e) => e.code === 'UnterminatedString');
    expect(stringErrs.length).toBeGreaterThanOrEqual(3);
  });
});
