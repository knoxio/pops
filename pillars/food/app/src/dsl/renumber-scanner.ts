/**
 * Renumber scanner — locates `@ingredient(N, ...)` declarations and
 * `@N` step-body references with byte offsets, so the renumber
 * transform (`renumber.ts`) can build precise CodeMirror change
 * descriptors.
 *
 * Why a text scanner instead of the AST?
 *
 *   1. `parseRecipeDsl` returns no AST on parse failure, and the editor
 *      mid-edit is constantly in transitional states.
 *   2. `StepBodyPart` carries no `SourceSpan` for `ref` parts — only the
 *      outer `StepBlock` does.
 *
 * The scanner walks the document directly, honours `\"` and `\\` escapes
 * inside step strings, and is robust to a half-typed document.
 */
import { scanStepRefs, STEP_HEAD } from './renumber-scanner-steps';
import {
  findMatchingParen,
  isLabelChar,
  matchAt,
  readDigits,
  skipWhitespace,
  type StepBodyRef,
} from './renumber-scanner-util';

export type { StepBodyRef };

export interface IngredientDeclaration {
  /** Index in the order declarations appear in the document, 0-based. */
  readonly declarationIndex: number;
  /** The N value currently in the source (the integer the user typed). */
  readonly currentIndex: number;
  /** Inclusive byte offset of the digit run for N. */
  readonly indexStart: number;
  /** Exclusive byte offset just past the digit run. */
  readonly indexEnd: number;
  /** Inclusive byte offset of the leading `@` (for callers that need the
   *  block start, e.g. to display a label preview). */
  readonly blockStart: number;
  /** Exclusive byte offset just past the matching `)` of the call. The
   *  scanner only emits declarations whose call closes — half-typed
   *  blocks with no `)` are dropped so the renumber transform can't
   *  produce overlapping slot ranges. */
  readonly blockEnd: number;
  /** Descriptor head slug if extractable, else `null`. Used by the UI to
   *  display "salt", "salt:flake", etc. in the reorder panel. */
  readonly label: string | null;
}

export interface ScanResult {
  readonly declarations: readonly IngredientDeclaration[];
  readonly stepRefs: readonly StepBodyRef[];
}

const DECL_HEAD = '@ingredient(';

export function scanIngredientUsages(source: string): ScanResult {
  const declarations: IngredientDeclaration[] = [];
  const stepRefs: StepBodyRef[] = [];
  let i = 0;
  while (i < source.length) {
    const skipped = skipNonCode(source, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const declScan = matchAt(source, i, DECL_HEAD)
      ? scanDeclaration(source, i, declarations.length)
      : null;
    if (declScan !== null) {
      if (declScan.decl !== null) declarations.push(declScan.decl);
      i = declScan.next;
      continue;
    }
    if (matchAt(source, i, STEP_HEAD)) {
      const refs = scanStepRefs(source, i);
      stepRefs.push(...refs.refs);
      i = refs.next;
      continue;
    }
    i += 1;
  }
  return { declarations, stepRefs };
}

/**
 * Top-level skip: jump over `//`-to-EOL comments and `"..."` strings (with
 * `\"`/`\\` escapes). Returns the same position if `pos` is not at one of
 * those tokens. This stops the scanner from matching `@ingredient(` text
 * that appears inside a comment or inside a string literal (e.g. the
 * `title=` arg of `@recipe`).
 */
function skipNonCode(source: string, pos: number): number {
  if (matchAt(source, pos, '//')) {
    let i = pos + 2;
    while (i < source.length && source[i] !== '\n') i += 1;
    return i;
  }
  if (source[pos] === '"') {
    let i = pos + 1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') return i + 1;
      i += 1;
    }
    return source.length;
  }
  return pos;
}

function scanDeclaration(
  source: string,
  pos: number,
  declarationIndex: number
): { decl: IngredientDeclaration | null; next: number } | null {
  const indexStart = skipWhitespace(source, pos + DECL_HEAD.length);
  const indexEnd = readDigits(source, indexStart);
  if (indexEnd === indexStart) return null;
  const currentIndex = Number.parseInt(source.slice(indexStart, indexEnd), 10);
  if (!Number.isFinite(currentIndex) || currentIndex < 0) return null;
  const close = findMatchingParen(source, pos + DECL_HEAD.length - 1);
  if (close === -1) {
    return { decl: null, next: indexEnd };
  }
  const label = extractLabel(source, indexEnd);
  return {
    decl: {
      declarationIndex,
      currentIndex,
      indexStart,
      indexEnd,
      blockStart: pos,
      blockEnd: close + 1,
      label,
    },
    next: close + 1,
  };
}

function extractLabel(source: string, afterIndex: number): string | null {
  let i = skipWhitespace(source, afterIndex);
  if (source[i] !== ',') return null;
  i = skipWhitespace(source, i + 1);
  const slugStart = i;
  while (i < source.length && isLabelChar(source[i] ?? '')) i += 1;
  return i === slugStart ? null : source.slice(slugStart, i);
}
