import { readBoolean, readIdentifier, readNumber, readSlug, readString } from './lex.js';

import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export interface PartialIngredient {
  index?: number;
  ingredient?: string;
  variant?: string;
  prep?: string;
  qty?: number;
  unit?: string;
  optional?: boolean;
  notes?: string;
}

export function readNamedArg(c: Cursor, errors: ParseError[], out: PartialIngredient): boolean {
  const keyMark = c.mark();
  const key = readIdentifier(c);
  if (key === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected named arg key',
      loc: c.spanFrom(keyMark),
    });
    return false;
  }
  c.skipWhitespace();
  if (c.peek() !== '=') {
    errors.push({
      code: 'InvalidArgValue',
      message: `Expected "=" after "${key}"`,
      loc: c.pointSpan(),
    });
    return false;
  }
  c.advance();
  c.skipWhitespace();
  return assignByKey({ c, errors, key, keyMark, out });
}

interface AssignCtx {
  c: Cursor;
  errors: ParseError[];
  key: string;
  keyMark: { line: number; col: number; offset: number };
  out: PartialIngredient;
}

function assignByKey(ctx: AssignCtx): boolean {
  const { c, errors, key, keyMark, out } = ctx;
  switch (key) {
    case 'variant':
    case 'prep':
      return readStringOrSlugField(c, errors, key, (v) => {
        out[key] = v;
      });
    case 'qty':
      return readQty(c, errors, out);
    case 'unit':
      return readStringOrSlugField(c, errors, 'unit', (v) => {
        out.unit = v;
      });
    case 'optional':
      return readOptional(c, errors, out);
    case 'notes':
      return readNotes(c, errors, out);
    default:
      errors.push({
        code: 'UnknownFunction',
        message: `Unknown @ingredient named arg "${key}"`,
        loc: c.spanFrom(keyMark),
      });
      while (!c.eof() && c.peek() !== ',' && c.peek() !== ')') c.advance();
      return true;
  }
}

function readQty(c: Cursor, errors: ParseError[], out: PartialIngredient): boolean {
  const n = readNumber(c);
  if (Number.isNaN(n)) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'qty must be numeric',
      loc: c.pointSpan(),
    });
    return false;
  }
  out.qty = n;
  return true;
}

function readOptional(c: Cursor, errors: ParseError[], out: PartialIngredient): boolean {
  const b = readBoolean(c);
  if (b === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'optional must be true or false',
      loc: c.pointSpan(),
    });
    return false;
  }
  out.optional = b;
  return true;
}

function readNotes(c: Cursor, errors: ParseError[], out: PartialIngredient): boolean {
  const s = readString(c);
  if (s === null || !s.terminated) {
    errors.push({
      code: 'UnterminatedString',
      message: 'notes must be a quoted string',
      loc: c.pointSpan(),
    });
    return false;
  }
  out.notes = s.value;
  return true;
}

function readStringOrSlugField(
  c: Cursor,
  errors: ParseError[],
  key: string,
  assign: (v: string) => void
): boolean {
  if (c.peek() === '"') {
    const s = readString(c);
    if (s === null || !s.terminated) {
      errors.push({
        code: 'UnterminatedString',
        message: `${key} string was not terminated`,
        loc: c.pointSpan(),
      });
      return false;
    }
    assign(s.value);
    return true;
  }
  const slug = readSlug(c);
  if (slug === null) {
    errors.push({
      code: 'InvalidSlug',
      message: `Expected a slug for ${key}`,
      loc: c.pointSpan(),
    });
    return false;
  }
  assign(slug);
  return true;
}
