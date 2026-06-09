/**
 * Renumber scanner — locates `@ingredient(N, ...)` declarations and
 * `@N` step-body references with byte offsets, so the renumber
 * transform (`renumber.ts`) can build precise CodeMirror change
 * descriptors.
 *
 * Why a text scanner instead of the AST?
 *
 *   1. `parseRecipeDsl` returns no AST on parse failure, and the editor
 *      mid-edit is constantly in transitional states (PRD-120 part D
 *      survey finding 1).
 *   2. `StepBodyPart` (PRD-114) carries no `SourceSpan` for `ref` parts —
 *      only the outer `StepBlock` does (survey finding 2).
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
    if (matchAt(source, i, DECL_HEAD)) {
      const result = scanDeclaration(source, i, declarations.length);
      if (result !== null) {
        declarations.push(result.decl);
        i = result.next;
        continue;
      }
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

function scanDeclaration(
  source: string,
  pos: number,
  declarationIndex: number
): { decl: IngredientDeclaration; next: number } | null {
  const indexStart = skipWhitespace(source, pos + DECL_HEAD.length);
  const indexEnd = readDigits(source, indexStart);
  if (indexEnd === indexStart) return null;
  const currentIndex = Number.parseInt(source.slice(indexStart, indexEnd), 10);
  if (!Number.isFinite(currentIndex) || currentIndex < 0) return null;
  const close = findMatchingParen(source, pos + DECL_HEAD.length - 1);
  const label = extractLabel(source, indexEnd);
  const next = close === -1 ? indexEnd : close + 1;
  return {
    decl: { declarationIndex, currentIndex, indexStart, indexEnd, blockStart: pos, label },
    next,
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
