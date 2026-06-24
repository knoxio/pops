/**
 * DSL editor autocomplete — step-body scanner.
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
 * literal allows. The hand-rolled parser (pillars/food/src/dsl, the
 * `@pops/food/dsl` entry) is the only thing that knows the full grammar;
 * this scanner only needs enough structure to disambiguate top-level vs
 * string-body cursor positions.
 */
export interface StepBodyContext {
  /** Offset of the first character inside the opening `"` of the body. */
  bodyStart: number;
  /** Offset of the closing `"` (or `text.length` if the body is open). */
  bodyEnd: number;
}

export function findStepBodyAtOffset(text: string, pos: number): StepBodyContext | null {
  // Walk the document forward respecting string boundaries; whenever
  // we leave a string-free region we look at the immediate text for an
  // `@step` call start. The last open body whose closing quote sits at
  // or after pos wins — nested step calls are illegal in the grammar so
  // there can be at most one.
  let last: StepBodyContext | null = null;
  for (const stepIdx of scanStepCallStarts(text)) {
    if (stepIdx >= pos) break;
    const candidate = tryStepBodyAt(text, stepIdx, pos);
    if (candidate !== null) last = candidate;
  }
  return last;
}

function tryStepBodyAt(text: string, stepIdx: number, pos: number): StepBodyContext | null {
  // `stepIdx` points at the `@` of `@step` and the lexer already
  // confirmed the next-char boundary is `(` or whitespace. Walk past
  // `@step` and any whitespace to reach the `(`.
  const openParen = text.indexOf('(', stepIdx + 5);
  if (openParen === -1 || openParen >= pos) return null;
  const openQuote = findOpeningQuote(text, openParen + 1);
  if (openQuote === null || openQuote >= pos) return null;
  const bodyStart = openQuote + 1;
  const bodyEnd = findClosingQuote(text, bodyStart);
  if (bodyEnd < pos) return null;
  return { bodyStart, bodyEnd };
}

/** Yield the offset of every `@step` call start at the top level —
 *  occurrences inside string literals (e.g. `@step("@step(...)")` body
 *  text) and inside longer identifiers (`@stepper(`) are skipped. */
function* scanStepCallStarts(text: string): IterableIterator<number> {
  const len = text.length;
  let inString = false;
  for (let i = 0; i < len; i += 1) {
    const ch = text[i] ?? '';
    if (inString) {
      i = stepStringForward(text, i, ch);
      if (i >= 0 && text[i] === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (isStepCallStart(text, i)) {
      yield i;
      i += 4; // skip past `@step` minus the loop increment
    }
  }
}

/** When forward-scanning inside a string, return the index of the next
 *  character to process. `\\` swallows the next char; everything else
 *  is left at `i` for the caller's loop. */
function stepStringForward(text: string, i: number, ch: string): number {
  if (ch !== '\\') return i;
  // Skip the escaped char; the for-loop's `i += 1` will advance past it.
  if (i + 1 >= text.length) return i + 1;
  return i + 1;
}

/** Check whether `i` is the start of an `@step` call (the `@`), bounded
 *  by `(` or whitespace so `@stepper(` doesn't match. */
function isStepCallStart(text: string, i: number): boolean {
  if (text[i] !== '@' || !text.startsWith('@step', i)) return false;
  const after = text[i + 5] ?? '';
  return after === '(' || after === ' ' || after === '\t' || after === '\n' || after === '\r';
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
 *  the index → descriptor mapping. String-literal interiors are
 *  skipped so an `@ingredient(...)` snippet that appears inside a
 *  `@step("...")` body doesn't surface phantom suggestions. Stops at
 *  the first close-paren of each match so a mid-edit half-typed call
 *  doesn't blow the scan; bad numbers and bad descriptors are silently
 *  skipped. */
export function collectStepIndexes(text: string): readonly IngredientIndexEntry[] {
  const out: IngredientIndexEntry[] = [];
  const seenIndexes = new Set<string>();
  const re = /@ingredient\s*\(\s*(\d+)\s*,\s*([a-z0-9_:-]+)/g;
  for (const region of scanOutsideStrings(text)) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null = re.exec(region);
    while (match !== null) {
      const index = match[1] ?? '';
      const slug = match[2] ?? '';
      if (index !== '' && !seenIndexes.has(index)) {
        seenIndexes.add(index);
        out.push({ index, slug });
      }
      match = re.exec(region);
    }
  }
  // Sort numerically — the regex order is document order, but the doc can
  // hold out-of-order indexes mid-edit; the autocomplete always shows
  // ascending indexes.
  return out.toSorted((a, b) => Number(a.index) - Number(b.index));
}

/** Split the document into the contiguous regions that sit outside
 *  string literals so a regex can run against them safely. Escaped
 *  quotes inside a string are honoured. */
function* scanOutsideStrings(text: string): IterableIterator<string> {
  const len = text.length;
  let regionStart = 0;
  let inString = false;
  for (let i = 0; i < len; i += 1) {
    const ch = text[i] ?? '';
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') {
        inString = false;
        regionStart = i + 1;
      }
      continue;
    }
    if (ch === '"') {
      if (i > regionStart) yield text.slice(regionStart, i);
      inString = true;
    }
  }
  if (!inString && regionStart < len) yield text.slice(regionStart);
}
