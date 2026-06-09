import { readSlug } from './lex.js';
import { readDescriptor } from './parse-descriptor.js';

/**
 * `@yield(...)` parser. Positional: `(descriptor, qty:unit)`. Special form
 * `0:none` marks a non-yielding recipe (techniques).
 */
import type { YieldDecl } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export function parseYieldArgs(c: Cursor, errors: ParseError[]): YieldDecl | null {
  c.skipWhitespace();
  const descMark = c.mark();
  const descriptor = readDescriptor(c, errors);
  if (descriptor === null) return null;
  c.skipWhitespace();
  if (c.peek() !== ',') {
    errors.push({
      code: 'InvalidArgCount',
      message: '@yield expects (descriptor, qty:unit)',
      loc: c.spanFrom(descMark),
    });
    return null;
  }
  c.advance(); // ,
  c.skipWhitespace();
  const qtyMark = c.mark();
  // Read qty (possibly 0) and unit, but allow 'none' as a unit literal.
  const num = parseInt(consumeDigits(c), 10);
  if (Number.isNaN(num)) {
    errors.push({
      code: 'InvalidQtyUnit',
      message: 'Expected qty:unit',
      loc: c.spanFrom(qtyMark),
    });
    return null;
  }
  if (c.peek() !== ':') {
    errors.push({
      code: 'InvalidQtyUnit',
      message: 'Expected ":" between qty and unit',
      loc: c.pointSpan(),
    });
    return null;
  }
  c.advance(); // :
  const unit = readSlug(c);
  if (unit === null) {
    errors.push({
      code: 'InvalidQtyUnit',
      message: 'Expected unit slug after ":"',
      loc: c.pointSpan(),
    });
    return null;
  }
  return { descriptor, qty: { qty: num, unit } };
}

function consumeDigits(c: Cursor): string {
  let out = '';
  if (c.peek() === '-') out += c.advance();
  while (!c.eof() && c.peek() >= '0' && c.peek() <= '9') out += c.advance();
  return out;
}
