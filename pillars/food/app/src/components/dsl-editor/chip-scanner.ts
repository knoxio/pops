/**
 * Self-contained source scanner for the DSL editor's chip widgets.
 *
 * The chip extension cannot use the DSL parser's AST: `parseRecipeDsl`
 * returns `{ ok: false, errors }` with NO ast on any parse failure, and the
 * user is constantly producing partial documents while typing.
 * `StepBodyPart` also carries no `SourceSpan` for inline refs, so even a
 * successful parse wouldn't supply chip offsets.
 *
 * Instead this scanner walks the text linearly:
 *
 *   - Recognises `@step("...")` bodies (escape-aware string termination on
 *     `\\` / `\"`) so the chip ranges stay scoped to step bodies and never
 *     leak into top-level markdown or `@ingredient(N, ...)` declarations.
 *   - Inside a body, delegates to `chip-scanner-step-body.ts` which emits
 *     ranges for `@N`, `@slug`, `@time(qty:unit)`, and
 *     `@temperature(qty:unit)`.
 *   - In a parallel sweep over the whole source, recognises
 *     `@ingredient(N, <descriptor>` calls and builds an
 *     `index → { slug, variant?, prep? }` map plus the offset where each
 *     `@ingredient(` call starts (used as a click-jump target).
 *
 * Pure — no React, no CodeMirror types, no DOM.
 */
import { collectStepBodyChips } from './chip-scanner-step-body';

import type { Chip, ChipScanResult, IngredientDeclaration } from './chip-scanner-types';

const SLUG_START = /[a-z]/;
const SLUG_CONT = /[a-z0-9-]/;
const DIGIT = /[0-9]/;

export function scanForChips(source: string): ChipScanResult {
  const chips: Chip[] = [];
  const declarations = new Map<number, IngredientDeclaration>();
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '@') {
      i += 1;
      continue;
    }
    const next = scanAtToken(source, i);
    if (next.kind === 'step') collectStepBodyChips(source, next.bodyStart, next.bodyEnd, chips);
    else if (next.kind === 'ingredient') declarations.set(next.declaration.index, next.declaration);
    i = next.endOffset;
  }
  return { chips, declarations };
}

type AtScan =
  | { kind: 'step'; bodyStart: number; bodyEnd: number; endOffset: number }
  | { kind: 'ingredient'; declaration: IngredientDeclaration; endOffset: number }
  | { kind: 'other'; endOffset: number };

function scanAtToken(source: string, at: number): AtScan {
  const name = readIdentifierAt(source, at + 1);
  if (name === null) return { kind: 'other', endOffset: at + 1 };
  const afterName = at + 1 + name.length;
  const openParen = skipWhitespace(source, afterName);
  if (source[openParen] !== '(') return { kind: 'other', endOffset: afterName };
  if (name === 'step') return scanStepCall(source, openParen);
  if (name === 'ingredient') return scanIngredientCall(source, at, openParen);
  const close = findMatchingClose(source, openParen);
  return { kind: 'other', endOffset: close === -1 ? source.length : close + 1 };
}

function scanStepCall(source: string, openParen: number): AtScan {
  const quote = skipWhitespace(source, openParen + 1);
  if (source[quote] !== '"') {
    const close = findMatchingClose(source, openParen);
    return { kind: 'other', endOffset: close === -1 ? source.length : close + 1 };
  }
  const bodyStart = quote + 1;
  const bodyEnd = findStringClose(source, bodyStart);
  if (bodyEnd === -1) return { kind: 'other', endOffset: source.length };
  const callClose = findMatchingClose(source, openParen);
  const endOffset = callClose === -1 ? bodyEnd + 1 : callClose + 1;
  return { kind: 'step', bodyStart, bodyEnd, endOffset };
}

function scanIngredientCall(source: string, at: number, openParen: number): AtScan {
  const close = findMatchingClose(source, openParen);
  const endOffset = close === -1 ? source.length : close + 1;
  const idxStart = skipWhitespace(source, openParen + 1);
  const idxText = readWhile(source, idxStart, DIGIT);
  if (idxText === '') return { kind: 'other', endOffset };
  const afterIdx = skipWhitespace(source, idxStart + idxText.length);
  if (source[afterIdx] !== ',') return { kind: 'other', endOffset };
  const slugStart = skipWhitespace(source, afterIdx + 1);
  const descriptor = readDescriptor(source, slugStart);
  if (descriptor === null) return { kind: 'other', endOffset };
  const declaration: IngredientDeclaration = {
    index: Number.parseInt(idxText, 10),
    slug: descriptor.slug,
    variant: descriptor.variant,
    prep: descriptor.prep,
    callStart: at,
  };
  return { kind: 'ingredient', declaration, endOffset };
}

function readDescriptor(
  source: string,
  start: number
): { slug: string; variant?: string; prep?: string } | null {
  const slug = readWhile(source, start, SLUG_CONT);
  if (slug === '' || !SLUG_START.test(slug[0] ?? '')) return null;
  let cursor = start + slug.length;
  const parts: (string | undefined)[] = [];
  for (let n = 0; n < 2; n += 1) {
    if (source[cursor] !== ':') break;
    cursor += 1;
    if (source[cursor] === '_') {
      parts.push(undefined);
      cursor += 1;
      continue;
    }
    const next = readWhile(source, cursor, SLUG_CONT);
    if (next === '') break;
    parts.push(next);
    cursor += next.length;
  }
  return { slug, variant: parts[0], prep: parts[1] };
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

function skipWhitespace(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\s/.test(source[i] ?? '')) i += 1;
  return i;
}

function findStringClose(source: string, bodyStart: number): number {
  let i = bodyStart;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i;
    i += 1;
  }
  return -1;
}

function findMatchingClose(source: string, openParen: number): number {
  let depth = 0;
  let i = openParen;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') {
      const close = findStringClose(source, i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}
