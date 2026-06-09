/**
 * DSL editor autocomplete — step-body scanner (PRD-120 part B).
 *
 * Two pure passes over the document:
 *
 *   1. `findStepBodyAtOffset(text, pos)` — was the cursor parked
 *      inside a `@step("...")` body? If so, return the body's start
 *      offset (the character just after the opening quote). Used by
 *      the cursor-context classifier to switch the suggestion source
 *      from top-level function args to step refs.
 *
 *   2. `collectStepIndexes(text)` — walks every `@ingredient(N, ...)`
 *      call in the document and returns `{ index, slug }` pairs. The
 *      step-ref autocomplete uses this to surface `@1` / `@2` /
 *      ... suggestions with a preview of what each index resolves to
 *      while the user is typing.
 *
 * Neither pass parses the document — both are tokenisation-shallow
 * string walks that honour the `\"` and `\\` escapes the DSL string
 * literal allows. The hand-rolled parser at PRD-114 is the only thing
 * that knows the full grammar; this scanner only needs enough
 * structure to disambiguate top-level vs string-body cursor positions.
 */
export interface StepBodyContext {
  /** Offset of the first character inside the opening `"` of the body. */
  bodyStart: number;
  /** Offset of the closing `"` (or `text.length` if the body is open). */
  bodyEnd: number;
}

export function findStepBodyAtOffset(text: string, pos: number): StepBodyContext | null {
  // Find every `@step("...` start that begins before pos and whose
  // closing quote sits at or after pos. The last such start wins
  // because nested step calls are illegal in the grammar — there can be
  // at most one open body at any cursor.
  let stepIdx = text.indexOf('@step', 0);
  let last: StepBodyContext | null = null;
  while (stepIdx !== -1 && stepIdx < pos) {
    const candidate = tryStepBodyAt(text, stepIdx, pos);
    if (candidate !== null) last = candidate;
    stepIdx = text.indexOf('@step', stepIdx + 5);
  }
  return last;
}

function tryStepBodyAt(text: string, stepIdx: number, pos: number): StepBodyContext | null {
  const openParen = text.indexOf('(', stepIdx + 5);
  if (openParen === -1 || openParen >= pos) return null;
  const openQuote = findOpeningQuote(text, openParen + 1);
  if (openQuote === null || openQuote >= pos) return null;
  const bodyStart = openQuote + 1;
  const bodyEnd = findClosingQuote(text, bodyStart);
  if (bodyEnd < pos) return null;
  return { bodyStart, bodyEnd };
}

/** Walk forward from `from`, skipping whitespace, looking for the first
 *  `"`. Returns its offset or `null` if a non-whitespace, non-quote
 *  character intervenes (e.g. the user typed `@step(123)`). */
function findOpeningQuote(text: string, from: number): number | null {
  let i = from;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (ch === '"') return i;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return null;
    i += 1;
  }
  return null;
}

/** Walk forward looking for the matching closing `"`, honouring `\\`
 *  and `\"` escapes. Returns `text.length` if the body is unterminated
 *  (the document is still mid-edit). */
function findClosingQuote(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (ch === '\\') {
      i += 2; // skip escape
      continue;
    }
    if (ch === '"') return i;
    i += 1;
  }
  return text.length;
}

export interface IngredientIndexEntry {
  /** Insertion text (the digits — `1`, `2`, ...). */
  index: string;
  /** Display slug for the popup ("rice", "banana:raw", ...). Empty if
   *  the declaration is malformed. */
  slug: string;
}

/** Scan top-level `@ingredient(N, <descriptor>...)` calls and return
 *  the index → descriptor mapping. Stops at the first close-paren so a
 *  mid-edit half-typed call doesn't blow the scan; bad numbers and bad
 *  descriptors are silently skipped. */
export function collectStepIndexes(text: string): readonly IngredientIndexEntry[] {
  const out: IngredientIndexEntry[] = [];
  const seenIndexes = new Set<string>();
  const re = /@ingredient\s*\(\s*(\d+)\s*,\s*([a-z0-9_:-]+)/g;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    const index = match[1] ?? '';
    const slug = match[2] ?? '';
    if (index !== '' && !seenIndexes.has(index)) {
      seenIndexes.add(index);
      out.push({ index, slug });
    }
    match = re.exec(text);
  }
  // Sort numerically — the regex order is document order; PRD-119 may
  // renumber, so the autocomplete should always show ascending indexes
  // even if the user mid-edit has them out of order in the doc.
  return out.toSorted((a, b) => Number(a.index) - Number(b.index));
}
