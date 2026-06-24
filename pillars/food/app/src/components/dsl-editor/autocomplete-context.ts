/**
 * DSL editor autocomplete — cursor-context classifier.
 *
 * Inspects the document slice immediately before the cursor and reports
 * which autocomplete source should fire. Pure: no CodeMirror imports, no
 * async work, no document mutation.
 *
 * The classifier walks **backwards** from the cursor over the prefix
 * because the grammar is line-aware (`@step("...")` bodies can span
 * lines via the parser but autocomplete only needs the unbalanced-paren
 * region between the cursor and the most recent unclosed `@<func>(` or
 * the last newline outside a step body). A full recursive-descent reparse
 * on every keystroke is overkill — the suffix-walk is sufficient for the
 * contexts that exist.
 */
import { findStepBodyAtOffset } from './autocomplete-step-bodies';

/** Cursor position classification result. The `from` field tells the
 *  CodeMirror source where the active token starts so it can build a
 *  replacement range; `null` means "use the matched word boundary". */
export type CursorContext =
  | { kind: 'none' }
  /** Just after a bare `@` outside any function call. */
  | { kind: 'function-name'; from: number; query: string }
  /** Inside `@ingredient(N, ` or `@yield(` — slug search. */
  | { kind: 'descriptor-slug'; from: number; query: string }
  /** Inside a descriptor after `<ingredient>:` — variants. */
  | { kind: 'descriptor-variant'; from: number; query: string; ingredientSlug: string }
  /** Inside a descriptor after `<ingredient>:<variant>:` — prep states. */
  | { kind: 'descriptor-prep'; from: number; query: string }
  /** Inside a `qty:unit` after the colon. */
  | { kind: 'unit'; from: number; query: string }
  /** Inside a `@step("...")` body after `@` — step refs (index OR slug). */
  | { kind: 'step-ref'; from: number; query: string; bodyStart: number };

/** Identifier characters per the DSL grammar
 *  (pillars/food/docs/prds/dsl-parser): lowercase + digits + hyphen.
 *  Numbers also need to be recognised at the start (for `@N` step refs
 *  and `qty:` values). */
const IDENT_RE = /^[a-z0-9-]+$/;

export function classifyCursor(text: string, pos: number): CursorContext {
  if (pos < 0 || pos > text.length) return { kind: 'none' };

  // Step bodies have their own world — the `@<thing>` inside a string is
  // a step-ref, not a top-level call.
  const stepBody = findStepBodyAtOffset(text, pos);
  if (stepBody !== null) return classifyStepBody(text, pos, stepBody.bodyStart);

  return classifyTopLevel(text, pos);
}

function classifyStepBody(text: string, pos: number, bodyStart: number): CursorContext {
  // Walk back to the most recent `@` since the body's opening quote.
  let i = pos;
  while (i > bodyStart && text[i - 1] !== '@') {
    const ch = text[i - 1] ?? '';
    if (ch === '"' || ch === '\n' || ch === ' ') break;
    if (!/[a-z0-9-]/.test(ch)) break;
    i -= 1;
  }
  if (i === 0 || text[i - 1] !== '@') return { kind: 'none' };
  const query = text.slice(i, pos);
  // `from` covers the @ itself so a re-selection replaces the whole token.
  return { kind: 'step-ref', from: i - 1, query, bodyStart };
}

function classifyTopLevel(text: string, pos: number): CursorContext {
  const tail = scanTrailingWord(text, pos);
  const head = text.slice(0, tail.start);

  // `@` cases (function name vs inside-call).
  if (tail.start > 0 && text[tail.start - 1] === '@') {
    // If the @ is itself inside an unclosed `(`, we're naming a function
    // mid-call which the user almost certainly didn't mean — treat as
    // function-name suggestion regardless. Keep this branch top so
    // descriptor slug detection doesn't shadow it.
    return { kind: 'function-name', from: tail.start - 1, query: tail.word };
  }

  // Inside a `qty:` value — number, colon, suggesting unit identifier.
  const unitCtx = matchUnitContext(head, tail);
  if (unitCtx !== null) return unitCtx;

  // Descriptor positions: `<func>(` ... `<slug>:<v>:<p>` segments.
  const descriptorCtx = matchDescriptorContext(head, tail);
  if (descriptorCtx !== null) return descriptorCtx;

  return { kind: 'none' };
}

/** Read the trailing alphanumeric run that the user is currently
 *  typing (the "active word"). Returns the run's start offset and the
 *  text. An empty trailing word is legitimate — the cursor may be
 *  immediately after `@` or `:` with nothing typed yet. */
function scanTrailingWord(text: string, pos: number): { start: number; word: string } {
  let start = pos;
  while (start > 0 && /[a-z0-9-]/.test(text[start - 1] ?? '')) start -= 1;
  return { start, word: text.slice(start, pos) };
}

function matchUnitContext(
  head: string,
  tail: { start: number; word: string }
): CursorContext | null {
  // Trailing `<digits>(.<digits>)?:` immediately before the active word
  // marks a qty:unit slot. The head ends with the colon (we don't slurp
  // it into the word).
  if (!head.endsWith(':')) return null;
  const noColon = head.slice(0, -1);
  if (!/[0-9](?:\.[0-9]+)?$/.test(noColon)) return null;
  if (!(tail.word === '' || IDENT_RE.test(tail.word))) return null;
  return { kind: 'unit', from: tail.start, query: tail.word };
}

function matchDescriptorContext(
  head: string,
  tail: { start: number; word: string }
): CursorContext | null {
  // Descriptor slots only appear inside an unbalanced `(`. Find it.
  const openParenIdx = findOpenParenStart(head);
  if (openParenIdx === null) return null;

  // Inside the parens we have the function name (just before `(`) and
  // the args typed so far. Splitting by top-level commas gives us the
  // current arg's text.
  const funcName = readFunctionName(head, openParenIdx);
  if (funcName === null) return null;

  const argsText = head.slice(openParenIdx + 1);
  const currentArg = lastTopLevelComma(argsText);

  // First-arg slots:
  //   @ingredient(N, descriptor, qty:unit) — descriptor is the 2nd arg.
  //   @yield(descriptor, qty:unit)         — descriptor is the 1st arg.
  // For simplicity we treat ANY arg slot inside these two functions as
  // a slug candidate when the active text + the arg-prefix matches the
  // descriptor shape. The qty-unit case is handled earlier and returns
  // first; what reaches here is genuine descriptor territory.
  if (funcName !== 'ingredient' && funcName !== 'yield') return null;

  return matchDescriptorSegments(currentArg, tail);
}

function matchDescriptorSegments(
  currentArg: string,
  tail: { start: number; word: string }
): CursorContext | null {
  if (!isIdentTail(tail.word)) return null;
  // The current arg is `<maybe leading space><slug>[:<variant>[:<prep>]]`
  // with the active word at the tail. Strip leading whitespace and
  // split on `:`.
  const segments = currentArg.replace(/^\s+/, '').split(':');
  if (segments.length === 1) {
    return { kind: 'descriptor-slug', from: tail.start, query: tail.word };
  }
  if (segments.length === 2) {
    const ingredientSlug = segments[0]?.trim() ?? '';
    if (ingredientSlug === '' || !IDENT_RE.test(ingredientSlug)) return null;
    return { kind: 'descriptor-variant', from: tail.start, query: tail.word, ingredientSlug };
  }
  if (segments.length === 3) {
    return { kind: 'descriptor-prep', from: tail.start, query: tail.word };
  }
  return null;
}

function isIdentTail(word: string): boolean {
  return word === '' || IDENT_RE.test(word);
}

/** Find the index of the most recent unclosed `(` in `head` (where the
 *  cursor sits). Returns `null` when none. Skips parens that appear
 *  inside double-quoted string literals (step bodies were already
 *  handled by `findStepBodyAtOffset`, but bare strings can still
 *  contain parens in other args). */
function findOpenParenStart(head: string): number | null {
  const state: ParenScan = { depth: 0, inString: false, escaped: false };
  for (let i = head.length - 1; i >= 0; i -= 1) {
    const ch = head[i] ?? '';
    if (state.inString) {
      stepStringBackwards(state, ch);
      continue;
    }
    if (ch === '"') {
      state.inString = true;
      continue;
    }
    if (ch === ')') {
      state.depth += 1;
      continue;
    }
    if (ch === '(') {
      if (state.depth === 0) return i;
      state.depth -= 1;
      continue;
    }
    // Unclosed `(` shouldn't span a top-level newline outside a string
    // — most paste-state edge cases land here and are best ignored.
    if (ch === '\n' && state.depth === 0) return null;
  }
  return null;
}

interface ParenScan {
  depth: number;
  inString: boolean;
  escaped: boolean;
}

function stepStringBackwards(state: ParenScan, ch: string): void {
  // Walking backwards through a string: stop the string at the matching
  // opening quote. Track `escaped` so `\\` followed by `"` doesn't close
  // the string prematurely on the reverse walk.
  if (ch === '"' && !state.escaped) state.inString = false;
  state.escaped = ch === '\\' ? !state.escaped : false;
}

/** Read the identifier immediately before the `(` at `openParenIdx` —
 *  the function name without the leading `@`. */
function readFunctionName(head: string, openParenIdx: number): string | null {
  if (openParenIdx <= 0) return null;
  let end = openParenIdx;
  let start = end;
  while (start > 0 && /[a-z0-9-]/.test(head[start - 1] ?? '')) start -= 1;
  if (start === end) return null;
  if (head[start - 1] !== '@') return null;
  return head.slice(start, end);
}

/** Return the text of the current arg (everything after the most recent
 *  top-level comma inside the paren group). Ignores commas that appear
 *  inside strings. */
function lastTopLevelComma(argsText: string): string {
  let inString = false;
  let escaped = false;
  for (let i = argsText.length - 1; i >= 0; i -= 1) {
    const ch = argsText[i] ?? '';
    if (inString) {
      if (ch === '"' && !escaped) inString = false;
      escaped = ch === '\\' ? !escaped : false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === ',') return argsText.slice(i + 1);
  }
  return argsText;
}
