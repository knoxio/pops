import { readIdentifier } from './lex.js';
import { assignRecipeArg } from './parse-recipe-assign.js';

/**
 * `@recipe(...)` parser. All args are named (key=value). Required: `slug`,
 * `title`. Optional: `servings`, `prep_time`, `cook_time`, `recipe_type`,
 * `summary`.
 */
import type { RecipeHeader } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export function parseRecipeArgs(
  c: Cursor,
  errors: ParseError[],
  closeAt: { startLine: number; startCol: number }
): RecipeHeader | null {
  const header: Partial<RecipeHeader> = {};
  while (!c.eof() && c.peek() !== ')') {
    if (!readOneArg(c, errors, header)) return null;
  }
  return validateRequiredFields(header, errors, closeAt);
}

function readOneArg(c: Cursor, errors: ParseError[], header: Partial<RecipeHeader>): boolean {
  c.skipWhitespace();
  if (c.peek() === ')') return true;
  const keyMark = c.mark();
  const key = readIdentifier(c);
  if (key === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected named arg (key=value) in @recipe',
      loc: c.spanFrom(keyMark),
    });
    return false;
  }
  c.skipWhitespace();
  if (c.peek() !== '=') {
    errors.push({
      code: 'InvalidArgValue',
      message: `@recipe args are all named; expected "=" after "${key}"`,
      loc: c.pointSpan(),
    });
    return false;
  }
  c.advance();
  c.skipWhitespace();
  assignRecipeArg({ c, errors, key, header, keyMark });
  c.skipWhitespace();
  if (c.peek() === ',') {
    c.advance();
    return true;
  }
  if (c.peek() === ')') return true;
  errors.push({
    code: 'UnexpectedToken',
    message: 'Expected "," or ")" after @recipe arg',
    loc: c.pointSpan(),
  });
  return false;
}

function validateRequiredFields(
  header: Partial<RecipeHeader>,
  errors: ParseError[],
  closeAt: { startLine: number; startCol: number }
): RecipeHeader | null {
  const tailLoc = {
    startLine: closeAt.startLine,
    startCol: closeAt.startCol,
    endLine: closeAt.startLine,
    endCol: closeAt.startCol,
  };
  if (header.slug === undefined || header.slug === '') {
    errors.push({
      code: 'InvalidSlug',
      message: '@recipe requires a non-empty `slug`',
      loc: tailLoc,
    });
    return null;
  }
  if (header.title === undefined || header.title === '') {
    errors.push({
      code: 'InvalidArgValue',
      message: '@recipe requires a non-empty `title`',
      loc: tailLoc,
    });
    return null;
  }
  return header as RecipeHeader;
}
