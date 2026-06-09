import { isDigit, isSlugCont, isSlugStart } from './cursor.js';

/**
 * Step bodies are quoted strings containing markdown text plus inline refs
 * and inline functions:
 *
 *   `@N`         — reference to ingredient with index N
 *   `@slug`      — reference to a registered slug (resolved downstream)
 *   `@time(qty:unit)`         — inline timer
 *   `@temperature(qty:unit)`  — inline temperature widget
 *
 * Outside `@step` bodies, inline refs are syntax errors. Here, we accept
 * any `@N` or `@slug` and record it as a `ref` AST node — the resolver
 * validates referents.
 */
import type { QtyUnit, StepBody, StepBodyPart } from './ast.js';

const INLINE_FUNCS = new Set(['time', 'temperature']);

type AtHandler = { consumed: number; part: StepBodyPart | null; raw?: string };

/**
 * Parse a step body string into `StepBodyPart[]`. The input has already
 * been unescaped — `\"` is now `"`, `\n` is `\n`, etc.
 */
export function parseStepBody(
  raw: string,
  onBadInline: (text: string, offsetInBody: number) => void
): StepBody {
  const out: StepBody = [];
  let i = 0;
  let textRun = '';
  const flushText = (): void => {
    if (textRun !== '') {
      out.push({ kind: 'text', value: textRun });
      textRun = '';
    }
  };
  while (i < raw.length) {
    const ch = raw[i] ?? '';
    if (ch !== '@') {
      textRun += ch;
      i += 1;
      continue;
    }
    const next = handleAt(raw, i, onBadInline);
    if (next.part !== null) {
      flushText();
      out.push(next.part);
    } else if (next.raw !== undefined) {
      textRun += next.raw;
    }
    i += next.consumed;
  }
  flushText();
  return out;
}

function handleAt(
  raw: string,
  i: number,
  onBadInline: (text: string, offsetInBody: number) => void
): AtHandler {
  const next = raw[i + 1] ?? '';
  if (isDigit(next)) return handleIndexRef(raw, i);
  if (isSlugStart(next)) return handleSlugOrFunc(raw, i, onBadInline);
  return { consumed: 1, part: null, raw: '@' };
}

function handleIndexRef(raw: string, i: number): AtHandler {
  let j = i + 1;
  let numText = '';
  while (j < raw.length && isDigit(raw[j] ?? '')) {
    numText += raw[j];
    j += 1;
  }
  return { consumed: j - i, part: { kind: 'ref', ref: Number.parseInt(numText, 10) } };
}

function handleSlugOrFunc(
  raw: string,
  i: number,
  onBadInline: (text: string, offsetInBody: number) => void
): AtHandler {
  let j = i + 1;
  let name = '';
  while (j < raw.length && isSlugCont(raw[j] ?? '')) {
    name += raw[j];
    j += 1;
  }
  if (raw[j] === '(') {
    if (INLINE_FUNCS.has(name)) return handleInlineFunc(raw, i, j, name);
    onBadInline(raw.slice(i, j), i);
    return { consumed: j - i, part: null, raw: raw.slice(i, j) };
  }
  return { consumed: j - i, part: { kind: 'ref', ref: name } };
}

function handleInlineFunc(raw: string, i: number, openParen: number, name: string): AtHandler {
  const close = raw.indexOf(')', openParen + 1);
  if (close === -1) {
    return { consumed: openParen + 1 - i, part: null, raw: raw.slice(i, openParen + 1) };
  }
  const inner = raw.slice(openParen + 1, close);
  const qu = parseInlineQtyUnit(inner);
  if (qu === null) {
    return { consumed: close + 1 - i, part: null, raw: raw.slice(i, close + 1) };
  }
  const part: StepBodyPart =
    name === 'time' ? { kind: 'time', qty: qu } : { kind: 'temperature', qty: qu };
  return { consumed: close + 1 - i, part };
}

function parseInlineQtyUnit(input: string): QtyUnit | null {
  const trimmed = input.trim();
  const colon = trimmed.indexOf(':');
  if (colon === -1) return null;
  const numText = trimmed.slice(0, colon).trim();
  const unitText = trimmed.slice(colon + 1).trim();
  const num = Number(numText);
  if (!Number.isFinite(num)) return null;
  if (unitText === '' || !isSlugStart(unitText[0] ?? '')) return null;
  for (const ch of unitText) {
    if (!isSlugCont(ch)) return null;
  }
  return { qty: num, unit: unitText };
}
