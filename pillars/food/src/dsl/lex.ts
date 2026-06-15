import { isDigit, isIdentCont, isIdentStart, isSlugCont, isSlugStart } from './cursor.js';

import type { QtyUnit } from './ast.js';
/**
 * Lexer helpers — slug/number/string consumers used by every parser module.
 *
 * Returns `null` on a failed read so the caller can raise a typed error with
 * a span pointing at the offending character. The cursor is mutated only on
 * a successful read; on `null` the cursor sits at the bad position.
 */
import type { Cursor } from './cursor.js';

export function readSlug(c: Cursor): string | null {
  if (!isSlugStart(c.peek())) return null;
  let out = c.advance();
  while (isSlugCont(c.peek())) out += c.advance();
  // Disallow trailing hyphen — slugs are `[a-z][a-z0-9]*(-[a-z0-9]+)*`.
  if (out.endsWith('-')) return null;
  return out;
}

export function readIdentifier(c: Cursor): string | null {
  if (!isIdentStart(c.peek())) return null;
  let out = c.advance();
  while (isIdentCont(c.peek())) out += c.advance();
  return out;
}

/** Returns `NaN` on no-match; caller checks via `Number.isNaN`. */
export function readNumber(c: Cursor): number {
  const start = c.offset;
  if (c.peek() === '-') c.advance();
  if (!isDigit(c.peek())) {
    c.offset = start; // rewind sign
    // Re-derive line/col from the slice we walked back over — but since `-`
    // is one column, simple decrement is fine when on same line.
    if (start < c.offset) c.col -= 1;
    return Number.NaN;
  }
  while (isDigit(c.peek())) c.advance();
  if (c.peek() === '.' && isDigit(c.peekAt(1))) {
    c.advance(); // .
    while (isDigit(c.peek())) c.advance();
  }
  const text = c.input.slice(start, c.offset);
  return Number(text);
}

/**
 * Read a double-quoted string. Returns `{ value, terminated }`. When
 * `terminated` is false the closing quote was never found — caller raises
 * `UnterminatedString` with the span pointing at the opening quote.
 *
 * Escapes: \\" \\\\ \\n. Other backslash sequences are literal characters.
 */
export function readString(c: Cursor): { value: string; terminated: boolean } | null {
  if (c.peek() !== '"') return null;
  c.advance(); // opening "
  let out = '';
  while (!c.eof()) {
    const ch = c.peek();
    if (ch === '"') {
      c.advance();
      return { value: out, terminated: true };
    }
    // Newlines inside a string terminate it as unterminated — strings are
    // single-line. The parser raises UnterminatedString at the opening quote
    // and recovers at the next line.
    if (ch === '\n') {
      return { value: out, terminated: false };
    }
    if (ch === '\\') {
      c.advance();
      const next = c.peek();
      if (next === '"' || next === '\\') {
        out += c.advance();
      } else if (next === 'n') {
        c.advance();
        out += '\n';
      } else if (next === '' || next === '\n') {
        return { value: out, terminated: false };
      } else {
        // Unknown escape — preserve backslash + char literally.
        out += '\\' + c.advance();
      }
      continue;
    }
    out += c.advance();
  }
  return { value: out, terminated: false };
}

/**
 * Read a `qty:unit` token. Returns the parsed shape or `null` on no-match.
 * Special form `0:none` is allowed; unit slug grammar is `[a-z][a-z0-9-]*`.
 */
export function readQtyUnit(c: Cursor): QtyUnit | null {
  const save = c.mark();
  const qty = readNumber(c);
  if (Number.isNaN(qty)) {
    rewind(c, save);
    return null;
  }
  if (c.peek() !== ':') {
    rewind(c, save);
    return null;
  }
  c.advance(); // :
  const unit = readSlug(c);
  if (unit === null) {
    rewind(c, save);
    return null;
  }
  return { qty, unit };
}

/** Read a quoted-string OR bare slug — used as a generic value cell. */
export function readBoolean(c: Cursor): boolean | null {
  if (c.peekString(4) === 'true' && !isIdentCont(c.peekAt(4))) {
    c.advanceN(4);
    return true;
  }
  if (c.peekString(5) === 'false' && !isIdentCont(c.peekAt(5))) {
    c.advanceN(5);
    return false;
  }
  return null;
}

function rewind(c: Cursor, save: { offset: number; line: number; col: number }): void {
  c.offset = save.offset;
  c.line = save.line;
  c.col = save.col;
}
