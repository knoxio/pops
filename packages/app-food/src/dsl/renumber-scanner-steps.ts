/**
 * Step-body fragment of the renumber scanner. Kept separate from
 * `renumber-scanner.ts` so each file stays under the 200-line lint cap.
 *
 * Responsible for locating `@N` integer-index refs inside the body string
 * of a `@step("...")` call, honouring `\\` and `\"` escape sequences.
 * `@slug` references and `@time(...)` / `@temperature(...)` calls are
 * intentionally skipped — renumber only touches integer-index refs.
 */
import {
  findMatchingParen,
  readDigits,
  skipWhitespace,
  type StepBodyRef,
} from './renumber-scanner-util';

export const STEP_HEAD = '@step(';

export interface StepRefsResult {
  readonly refs: readonly StepBodyRef[];
  readonly next: number;
}

export function scanStepRefs(source: string, pos: number): StepRefsResult {
  const stringOpen = findStepStringOpen(source, pos + STEP_HEAD.length);
  if (stringOpen === -1) return { refs: [], next: pos + STEP_HEAD.length };
  const stringEnd = findStringEnd(source, stringOpen + 1);
  if (stringEnd === -1) return { refs: [], next: source.length };
  const refs = collectStepRefs(source, stringOpen + 1, stringEnd);
  const close = findMatchingParen(source, pos + STEP_HEAD.length - 1);
  return { refs, next: close === -1 ? stringEnd + 1 : close + 1 };
}

function findStepStringOpen(source: string, start: number): number {
  const i = skipWhitespace(source, start);
  return source[i] === '"' ? i : -1;
}

function findStringEnd(source: string, bodyStart: number): number {
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

function collectStepRefs(source: string, from: number, to: number): StepBodyRef[] {
  const out: StepBodyRef[] = [];
  let i = from;
  while (i < to) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch !== '@') {
      i += 1;
      continue;
    }
    const ref = tryReadIndexRef(source, i, to);
    if (ref !== null) {
      out.push(ref);
      i = ref.indexEnd;
      continue;
    }
    i += 1;
  }
  return out;
}

function tryReadIndexRef(source: string, at: number, limit: number): StepBodyRef | null {
  const indexStart = at + 1;
  if (indexStart >= limit) return null;
  const indexEnd = readDigits(source, indexStart);
  if (indexEnd === indexStart) return null;
  const currentIndex = Number.parseInt(source.slice(indexStart, indexEnd), 10);
  if (!Number.isFinite(currentIndex) || currentIndex < 0) return null;
  return { atOffset: at, indexStart, indexEnd, currentIndex };
}
