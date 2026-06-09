/**
 * Step-body chip extraction (PRD-120 part D).
 *
 * Extracted from `chip-scanner.ts` to keep both files under the per-file
 * line cap. The functions here walk the *interior* of a single
 * `@step("...")` body and emit chip ranges for `@N`, `@slug`,
 * `@time(qty:unit)`, and `@temperature(qty:unit)`. The outer scanner owns
 * step-body detection, escape-aware string termination, and the parallel
 * `@ingredient(N, ...)` sweep.
 */
import type { Chip } from './chip-scanner-types';

const DIGIT = /[0-9]/;
const SLUG_START = /[a-z]/;
const SLUG_CONT = /[a-z0-9-]/;
const INLINE_FUNCS = new Set(['time', 'temperature']);

export function collectStepBodyChips(
  source: string,
  start: number,
  end: number,
  out: Chip[]
): void {
  let i = start;
  while (i < end) {
    if (source[i] !== '@') {
      i += 1;
      continue;
    }
    const next = source[i + 1] ?? '';
    if (DIGIT.test(next)) {
      const digits = readWhile(source, i + 1, DIGIT);
      out.push({
        kind: 'ref-index',
        index: Number.parseInt(digits, 10),
        from: i,
        to: i + 1 + digits.length,
      });
      i += 1 + digits.length;
      continue;
    }
    if (SLUG_START.test(next)) {
      i = handleSlugOrFunc(source, i, end, out);
      continue;
    }
    i += 1;
  }
}

function handleSlugOrFunc(source: string, at: number, end: number, out: Chip[]): number {
  const name = readIdentifierAt(source, at + 1);
  if (name === null) return at + 1;
  const afterName = at + 1 + name.length;
  if (source[afterName] !== '(') {
    out.push({ kind: 'ref-slug', slug: name, from: at, to: afterName });
    return afterName;
  }
  // Slug followed by `(` is treated as an inline function. Only `@time`
  // and `@temperature` are recognised (matches PRD-114's parser, which
  // emits `BadInline` for any other identifier). For unknown functions,
  // skip the whole `name(...)` span without emitting any chip. When the
  // closing `)` is missing (common mid-edit), advance past the body's
  // end so subsequent scanning doesn't fire false-positive chips on
  // tokens that belong to the unterminated call's argument text.
  if (!INLINE_FUNCS.has(name)) {
    const close = source.indexOf(')', afterName + 1);
    return close === -1 || close >= end ? end : close + 1;
  }
  const close = source.indexOf(')', afterName + 1);
  if (close === -1 || close >= end) return end;
  const inner = source.slice(afterName + 1, close);
  const qu = parseInlineQtyUnit(inner);
  if (qu === null) return close + 1;
  out.push({
    kind: name === 'time' ? 'time' : 'temperature',
    qty: qu.qty,
    unit: qu.unit,
    from: at,
    to: close + 1,
  });
  return close + 1;
}

function parseInlineQtyUnit(input: string): { qty: number; unit: string } | null {
  const colon = input.indexOf(':');
  if (colon === -1) return null;
  const qty = Number(input.slice(0, colon).trim());
  if (!Number.isFinite(qty)) return null;
  const unit = input.slice(colon + 1).trim();
  if (unit === '' || !SLUG_START.test(unit[0] ?? '')) return null;
  for (const ch of unit) if (!SLUG_CONT.test(ch)) return null;
  return { qty, unit };
}

function readIdentifierAt(source: string, start: number): string | null {
  if (start >= source.length) return null;
  if (!SLUG_START.test(source[start] ?? '')) return null;
  return readWhile(source, start, SLUG_CONT);
}

function readWhile(source: string, start: number, pattern: RegExp): string {
  let i = start;
  while (i < source.length && pattern.test(source[i] ?? '')) i += 1;
  return source.slice(start, i);
}
