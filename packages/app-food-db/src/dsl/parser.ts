import { readIdentifier } from './lex.js';
import {
  type CursorMark,
  handleIngredient,
  handleRecipe,
  handleStep,
  handleYield,
  newState,
  type ParserState,
} from './parser-state.js';
import { findBalancedClose, recomputeLineCol } from './parser-util.js';

/**
 * Recipe DSL parser entry point. Grammar in ADR-023.
 *
 * Scans the input at the top level. When a line starts with `@<func>(`
 * (whitespace-tolerant), reads the balanced-paren block and dispatches to
 * the per-function handler in `parser-state.ts`. Other lines collect into
 * `markdown` blocks preserving author intent.
 *
 * Pure: same input → same output. No I/O, no DB lookups, no random.
 */
import type { MarkdownBlock, RecipeAst } from './ast.js';
import type { ParseError } from './errors.js';

export type ParseResult = { ok: true; ast: RecipeAst } | { ok: false; errors: ParseError[] };

export type { ParseError, ParseErrorCode } from './errors.js';
export type { SourceSpan } from './ast.js';

export function parseRecipeDsl(input: string): ParseResult {
  const state = newState(input);
  while (!state.c.eof()) {
    if (!parseTopLevelItem(state)) {
      return { ok: false, errors: state.errors };
    }
  }
  return finalise(state);
}

function finalise(state: ParserState): ParseResult {
  if (state.recipe === undefined) {
    state.errors.push({
      code: 'MissingRecipeHeader',
      message: '@recipe(...) header is required and must be the first block',
      loc: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
    });
  }
  if (state.yieldDecl === undefined) {
    state.errors.push({
      code: 'MissingYield',
      message: '@yield(...) is required',
      loc: state.recipeLoc ?? { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
    });
  }
  if (state.errors.length > 0) return { ok: false, errors: state.errors };
  if (state.recipe === undefined || state.yieldDecl === undefined) {
    return { ok: false, errors: state.errors };
  }
  return {
    ok: true,
    ast: { recipe: state.recipe, yield: state.yieldDecl, blocks: state.blocks },
  };
}

function parseTopLevelItem(state: ParserState): boolean {
  const { c } = state;
  c.skipWhitespace();
  if (c.eof()) return true;
  if (c.peekString(2) === '//') {
    c.skipToEndOfLine();
    return true;
  }
  if (c.peek() !== '@') {
    collectMarkdown(state);
    return true;
  }
  return dispatchFunc(state);
}

function collectMarkdown(state: ParserState): void {
  const { c } = state;
  const start = c.mark();
  let text = '';
  while (!c.eof()) {
    const lineStart = c.mark();
    let line = '';
    while (!c.eof() && c.peek() !== '\n') line += c.advance();
    if (!c.eof()) c.advance();
    if (line.trim() === '' && text === '') continue;
    if (line.trimStart().startsWith('@')) {
      c.offset = lineStart.offset;
      c.line = lineStart.line;
      c.col = lineStart.col;
      break;
    }
    text += line + '\n';
  }
  const trimmed = text.replace(/\n+$/, '');
  if (trimmed === '') return;
  const block: MarkdownBlock = { kind: 'markdown', text: trimmed, loc: state.c.spanFrom(start) };
  state.blocks.push(block);
}

function dispatchFunc(state: ParserState): boolean {
  const { c } = state;
  const start = c.mark();
  c.advance(); // @
  if (handleTopLevelRef(state, start)) return true;
  const name = readIdentifier(c);
  if (name === null) {
    state.errors.push({
      code: 'UnknownFunction',
      message: 'Expected function name after "@"',
      loc: c.spanFrom(start),
    });
    c.skipToEndOfLine();
    return true;
  }
  c.skipWhitespace(false);
  if (c.peek() !== '(') {
    state.errors.push({
      code: 'InlineRefOutsideStep',
      message: `"@${name}" reference outside @step body`,
      loc: c.spanFrom(start),
    });
    c.skipToEndOfLine();
    return true;
  }
  c.advance(); // (
  const closeOffset = findBalancedClose(c);
  if (closeOffset === -1) return recoverUnbalanced(state, start, name);
  return runHandler(state, start, closeOffset, name);
}

/** Returns `true` if the cursor's `@` started a top-level numeric ref (and was handled). */
function handleTopLevelRef(state: ParserState, start: CursorMark): boolean {
  const { c } = state;
  const next = c.peek();
  if (!(next >= '0' && next <= '9')) return false;
  while (!c.eof() && c.peek() >= '0' && c.peek() <= '9') c.advance();
  state.errors.push({
    code: 'InlineRefOutsideStep',
    message: 'Numeric ingredient reference is only allowed inside @step body',
    loc: c.spanFrom(start),
  });
  c.skipToEndOfLine();
  return true;
}

function recoverUnbalanced(state: ParserState, start: CursorMark, name: string): boolean {
  const { c } = state;
  if (name === 'step') {
    state.errors.push({
      code: 'UnterminatedString',
      message: '@step body string was not terminated before end of input',
      loc: c.spanFrom(start),
    });
  } else {
    state.errors.push({
      code: 'UnbalancedParens',
      message: `Unbalanced "(" after @${name}`,
      loc: c.spanFrom(start),
    });
  }
  c.skipToEndOfLine();
  return true;
}

function runHandler(
  state: ParserState,
  start: CursorMark,
  closeOffset: number,
  name: string
): boolean {
  const { c } = state;
  let result = true;
  switch (name) {
    case 'recipe':
      result = handleRecipe(state, start);
      break;
    case 'yield':
      result = handleYield(state, start);
      break;
    case 'ingredient':
      result = handleIngredient(state, start);
      break;
    case 'step':
      result = handleStep(state, start);
      break;
    default:
      state.errors.push({
        code: 'UnknownFunction',
        message: `Unknown function "@${name}"`,
        loc: c.spanFrom(start),
      });
  }
  c.offset = closeOffset + 1;
  recomputeLineCol(c, start);
  return result;
}
