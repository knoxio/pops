import type { Cursor } from './cursor.js';
import type { CursorMark } from './parser-state.js';

/**
 * Find the offset of the matching `)` for a `(` that the cursor just passed.
 * Strings are single-line: a `\n` inside a string ends it, allowing paren
 * matching to continue past an unterminated string on subsequent lines.
 */
export function findBalancedClose(c: Cursor): number {
  let depth = 1;
  let i = c.offset;
  let inString = false;
  while (i < c.input.length) {
    const ch = c.input[i] ?? '';
    if (inString) {
      if (ch === '\n') {
        inString = false;
        i += 1;
        continue;
      }
      if (ch === '\\' && i + 1 < c.input.length) {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Walk the input from `from.offset` to `c.offset`, updating `line`/`col`. */
export function recomputeLineCol(c: Cursor, from: CursorMark): void {
  let line = from.line;
  let col = from.col;
  for (let i = from.offset; i < c.offset; i += 1) {
    if (c.input[i] === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  c.line = line;
  c.col = col;
}
