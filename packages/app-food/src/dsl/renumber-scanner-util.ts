/**
 * Shared text-cursor utilities used by both the declaration scanner and
 * the step-body scanner under `renumber-scanner*.ts`.
 *
 * Re-exporting the `StepBodyRef` type from here too so its consumers
 * (the step scanner + the public renumber surface) share a single
 * definition without circular imports.
 */

export interface StepBodyRef {
  readonly atOffset: number;
  readonly indexStart: number;
  readonly indexEnd: number;
  readonly currentIndex: number;
}

export function skipWhitespace(source: string, pos: number): number {
  let i = pos;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return i;
    i += 1;
  }
  return i;
}

export function readDigits(source: string, pos: number): number {
  let i = pos;
  while (i < source.length) {
    const ch = source[i] ?? '';
    if (ch < '0' || ch > '9') break;
    i += 1;
  }
  return i;
}

/**
 * Walk forward from `openIndex` (pointing AT the `(`) to the matching `)`.
 * Honours `"…"` strings (with `\"` / `\\` escapes) so a `)` inside a step
 * body or notes string does not terminate the call. Returns -1 when no
 * matching paren is found before EOF (the document is half-typed).
 */
export function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  let inString = false;
  while (i < source.length) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

export function matchAt(source: string, pos: number, needle: string): boolean {
  if (pos + needle.length > source.length) return false;
  for (let k = 0; k < needle.length; k += 1) {
    if (source[pos + k] !== needle[k]) return false;
  }
  return true;
}

export function isLabelChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-' || ch === '_' || ch === ':'
  );
}
