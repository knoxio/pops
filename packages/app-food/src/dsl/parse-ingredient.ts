import { isIdentStart } from './cursor.js';
import { readNumber, readQtyUnit, readSlug } from './lex.js';
import { type PartialIngredient, readNamedArg } from './parse-ingredient-named.js';

/**
 * `@ingredient(...)` parser.
 *
 * Compact form: `(index, descriptor, qty:unit, optional?=bool, notes?=string)`.
 * Named form: `(index, slug, variant=, prep=, qty=, unit=, optional=, notes=)`.
 *
 * Both compile to the same `IngredientBlock`. Detection: after the index +
 * head slug, the descriptor extends if a `:` follows; subsequent args are
 * either positional `qty:unit` or `key=value` named args.
 *
 * Per-key named-arg readers live in `parse-ingredient-named.ts` so this
 * file stays under the line / complexity caps.
 */
import type { Descriptor, IngredientBlock, QtyUnit } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export function parseIngredientArgs(c: Cursor, errors: ParseError[]): IngredientBlock | null {
  const partial: PartialIngredient = {};
  if (!readIndex(c, errors, partial)) return null;
  if (!expectComma(c, errors)) return null;
  c.skipWhitespace();
  if (!readDescriptorInto(c, errors, partial)) return null;
  if (!readTail(c, errors, partial)) return null;
  if (partial.qty === undefined || partial.unit === undefined) {
    errors.push({
      code: 'InvalidArgCount',
      message: '@ingredient requires a qty:unit',
      loc: c.pointSpan(),
    });
    return null;
  }
  return assemble(partial);
}

function readIndex(c: Cursor, errors: ParseError[], partial: PartialIngredient): boolean {
  c.skipWhitespace();
  const idxMark = c.mark();
  const idx = readNumber(c);
  if (Number.isNaN(idx) || !Number.isInteger(idx) || idx < 0) {
    errors.push({
      code: 'InvalidArgValue',
      message: '@ingredient first arg must be a non-negative integer index',
      loc: c.spanFrom(idxMark),
    });
    return false;
  }
  partial.index = idx;
  return true;
}

function readTail(c: Cursor, errors: ParseError[], partial: PartialIngredient): boolean {
  c.skipWhitespace();
  while (!c.eof() && c.peek() === ',') {
    c.advance();
    c.skipWhitespace();
    if (c.peek() === ')') break;
    if (!readNextArg(c, errors, partial)) return false;
    c.skipWhitespace();
  }
  return true;
}

function readNextArg(c: Cursor, errors: ParseError[], partial: PartialIngredient): boolean {
  if (isNamedArgAhead(c)) return readNamedArg(c, errors, partial);
  if (partial.qty !== undefined) {
    errors.push({
      code: 'UnexpectedToken',
      message: 'Unexpected positional arg after qty:unit',
      loc: c.pointSpan(),
    });
    return false;
  }
  const qu = readQtyUnit(c);
  if (qu === null) {
    errors.push({
      code: 'InvalidQtyUnit',
      message: 'Expected qty:unit or named arg',
      loc: c.pointSpan(),
    });
    return false;
  }
  partial.qty = qu.qty;
  partial.unit = qu.unit;
  return true;
}

function readDescriptorInto(c: Cursor, errors: ParseError[], out: PartialIngredient): boolean {
  const headMark = c.mark();
  const head = readSlug(c);
  if (head === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected an ingredient slug',
      loc: c.spanFrom(headMark),
    });
    return false;
  }
  out.ingredient = head;
  if (c.peek() !== ':') return true;
  c.advance();
  const variantSeg = readSegment(c, errors);
  if (variantSeg === null) return false;
  if (variantSeg !== '_') out.variant = variantSeg;
  if (c.peek() !== ':') return true;
  c.advance();
  const prepSeg = readSegment(c, errors);
  if (prepSeg === null) return false;
  if (prepSeg !== '_') out.prep = prepSeg;
  if (c.peek() === ':') {
    errors.push({
      code: 'TrailingDescriptorColon',
      message: 'Descriptor has at most three segments (ingredient:variant:prep)',
      loc: c.pointSpan(),
    });
  }
  return true;
}

function readSegment(c: Cursor, errors: ParseError[]): string | '_' | null {
  if (c.peek() === '_') {
    c.advance();
    return '_';
  }
  const slug = readSlug(c);
  if (slug === null) {
    errors.push({
      code: 'TrailingDescriptorColon',
      message: 'Expected slug or "_" after ":" in descriptor',
      loc: c.pointSpan(),
    });
    return null;
  }
  return slug;
}

/** Peek for `<ident> =` (named arg) vs anything else (positional). */
function isNamedArgAhead(c: Cursor): boolean {
  if (!isIdentStart(c.peek())) return false;
  let i = 0;
  while (i < 64) {
    const ch = c.peekAt(i);
    if (ch === '=') return true;
    const lower = ch >= 'a' && ch <= 'z';
    const digit = ch >= '0' && ch <= '9';
    if (!(lower || digit || ch === '_')) return false;
    i += 1;
  }
  return false;
}

function expectComma(c: Cursor, errors: ParseError[]): boolean {
  c.skipWhitespace();
  if (c.peek() !== ',') {
    errors.push({
      code: 'InvalidArgCount',
      message: 'Expected "," in @ingredient',
      loc: c.pointSpan(),
    });
    return false;
  }
  c.advance();
  return true;
}

function assemble(p: PartialIngredient): IngredientBlock {
  if (
    p.ingredient === undefined ||
    p.qty === undefined ||
    p.unit === undefined ||
    p.index === undefined
  ) {
    throw new Error('assemble called with an incomplete partial — caller bug');
  }
  const descriptor: Descriptor = { ingredient: p.ingredient };
  if (p.variant !== undefined) descriptor.variant = p.variant;
  if (p.prep !== undefined) descriptor.prep = p.prep;
  const qty: QtyUnit = { qty: p.qty, unit: p.unit };
  const block: IngredientBlock = {
    kind: 'ingredient',
    index: p.index,
    descriptor,
    qty,
  };
  if (p.optional !== undefined) block.optional = p.optional;
  if (p.notes !== undefined) block.notes = p.notes;
  return block;
}
