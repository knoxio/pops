import { readSlug } from './lex.js';

/**
 * Compact descriptor parser — `slug[:slug_or_skip[:slug_or_skip]]`.
 *
 * Used inside `@yield(...)` and `@ingredient(...)` positional slots.
 * `_` skips a segment (e.g. `banana:_:mashed` is ingredient + prep, no
 * variant). Trailing `:` is forbidden — `banana:` raises
 * `TrailingDescriptorColon`.
 */
import type { Descriptor } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export function readDescriptor(c: Cursor, errors: ParseError[]): Descriptor | null {
  const start = c.mark();
  const head = readSlug(c);
  if (head === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected a slug at the start of a descriptor',
      loc: c.spanFrom(start),
    });
    return null;
  }
  const desc: Descriptor = { ingredient: head };
  // Optional variant segment.
  if (c.peek() !== ':') return desc;
  c.advance(); // :
  const variantSeg = readSegment(c, errors, 'variant');
  if (variantSeg === null) return desc;
  if (variantSeg !== '_') desc.variant = variantSeg;
  // Optional prep segment.
  if (c.peek() !== ':') return desc;
  c.advance(); // :
  const prepSeg = readSegment(c, errors, 'prep');
  if (prepSeg === null) return desc;
  if (prepSeg !== '_') desc.prep = prepSeg;
  // Forbid a 4th segment.
  if (c.peek() === ':') {
    errors.push({
      code: 'TrailingDescriptorColon',
      message: 'Descriptor has at most three segments (ingredient:variant:prep)',
      loc: c.pointSpan(),
    });
  }
  return desc;
}

function readSegment(c: Cursor, errors: ParseError[], label: string): string | '_' | null {
  if (c.peek() === '_') {
    c.advance();
    return '_';
  }
  const start = c.mark();
  const slug = readSlug(c);
  if (slug === null) {
    errors.push({
      code: 'TrailingDescriptorColon',
      message: `Expected slug or "_" after ":" in ${label} segment`,
      loc: c.spanFrom(start),
    });
    return null;
  }
  return slug;
}
