import { readNumber, readQtyUnit, readString } from './lex.js';

import type { RecipeHeader, RecipeTypeLiteral } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export interface KeyMark {
  line: number;
  col: number;
  offset: number;
}

const VALID_RECIPE_TYPES: ReadonlySet<RecipeTypeLiteral> = new Set<RecipeTypeLiteral>([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);

type AssignContext = {
  c: Cursor;
  errors: ParseError[];
  header: Partial<RecipeHeader>;
  keyMark: KeyMark;
};

export interface AssignArgs {
  c: Cursor;
  errors: ParseError[];
  key: string;
  header: Partial<RecipeHeader>;
  keyMark: KeyMark;
}

export function assignRecipeArg(args: AssignArgs): void {
  const { c, errors, key, header, keyMark } = args;
  const ctx: AssignContext = { c, errors, header, keyMark };
  switch (key) {
    case 'slug':
      return assignSlug(ctx);
    case 'title':
    case 'summary':
      return assignString(ctx, key);
    case 'servings':
      return assignServings(ctx);
    case 'prep_time':
    case 'cook_time':
      return assignTime(ctx, key);
    case 'recipe_type':
      return assignRecipeType(ctx);
    default:
      errors.push({
        code: 'UnknownFunction',
        message: `Unknown @recipe arg "${key}"`,
        loc: c.spanFrom(keyMark),
      });
      skipValue(c);
  }
}

function assignSlug(ctx: AssignContext): void {
  const v = readQuotedOrSlug(ctx.c, ctx.errors);
  if (v !== null) ctx.header.slug = v;
}

function assignString(ctx: AssignContext, key: 'title' | 'summary'): void {
  const s = readString(ctx.c);
  if (s === null || !s.terminated) {
    ctx.errors.push({
      code: 'UnterminatedString',
      message: `Expected quoted string for @recipe ${key}`,
      loc: ctx.c.spanFrom(ctx.keyMark),
    });
    return;
  }
  if (key === 'title') ctx.header.title = s.value;
  else ctx.header.summary = s.value;
}

function assignServings(ctx: AssignContext): void {
  const n = readNumber(ctx.c);
  if (Number.isNaN(n) || !Number.isInteger(n)) {
    ctx.errors.push({
      code: 'InvalidArgValue',
      message: 'servings must be a non-negative integer',
      loc: ctx.c.spanFrom(ctx.keyMark),
    });
    return;
  }
  ctx.header.servings = n;
}

function assignTime(ctx: AssignContext, key: 'prep_time' | 'cook_time'): void {
  const qu = readQtyUnit(ctx.c);
  if (qu === null) {
    ctx.errors.push({
      code: 'InvalidQtyUnit',
      message: `Expected qty:unit for @recipe ${key}`,
      loc: ctx.c.spanFrom(ctx.keyMark),
    });
    return;
  }
  if (key === 'prep_time') ctx.header.prepTime = qu;
  else ctx.header.cookTime = qu;
}

function assignRecipeType(ctx: AssignContext): void {
  const s = readString(ctx.c);
  if (s === null || !s.terminated) {
    ctx.errors.push({
      code: 'InvalidArgValue',
      message: 'recipe_type must be a quoted string',
      loc: ctx.c.spanFrom(ctx.keyMark),
    });
    return;
  }
  if (!VALID_RECIPE_TYPES.has(s.value as RecipeTypeLiteral)) {
    ctx.errors.push({
      code: 'InvalidArgValue',
      message: `Unknown recipe_type "${s.value}"`,
      loc: ctx.c.spanFrom(ctx.keyMark),
    });
    return;
  }
  ctx.header.recipeType = s.value as RecipeTypeLiteral;
}

function readQuotedOrSlug(c: Cursor, errors: ParseError[]): string | null {
  if (c.peek() === '"') {
    const s = readString(c);
    if (s === null || !s.terminated) {
      errors.push({
        code: 'UnterminatedString',
        message: 'Unterminated string',
        loc: c.pointSpan(),
      });
      return null;
    }
    return s.value;
  }
  const mark = c.mark();
  let out = '';
  while (
    !c.eof() &&
    c.peek() !== ',' &&
    c.peek() !== ')' &&
    c.peek() !== '\n' &&
    c.peek() !== ' '
  ) {
    out += c.advance();
  }
  if (out === '') {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected a value',
      loc: c.spanFrom(mark),
    });
    return null;
  }
  return out;
}

function skipValue(c: Cursor): void {
  while (!c.eof() && c.peek() !== ',' && c.peek() !== ')') c.advance();
}
