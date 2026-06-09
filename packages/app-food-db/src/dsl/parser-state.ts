import { Cursor } from './cursor.js';
import { parseIngredientArgs } from './parse-ingredient.js';
import { parseRecipeArgs } from './parse-recipe.js';
import { parseStepArgs } from './parse-step.js';
import { parseYieldArgs } from './parse-yield.js';

import type { AstBlock, IngredientBlock, RecipeAst, SourceSpan } from './ast.js';
import type { ParseError } from './errors.js';

export interface ParserState {
  c: Cursor;
  errors: ParseError[];
  recipe?: RecipeAst['recipe'];
  recipeLoc?: SourceSpan;
  yieldDecl?: RecipeAst['yield'];
  yieldLoc?: SourceSpan;
  blocks: AstBlock[];
  seenIndexes: Set<number>;
}

export interface CursorMark {
  line: number;
  col: number;
  offset: number;
}

export function newState(input: string): ParserState {
  return {
    c: new Cursor(input),
    errors: [],
    blocks: [],
    seenIndexes: new Set(),
  };
}

export function handleRecipe(state: ParserState, start: CursorMark): boolean {
  const { c } = state;
  const header = parseRecipeArgs(c, state.errors, { startLine: c.line, startCol: c.col });
  if (header === null) return true;
  if (state.recipe !== undefined) {
    state.errors.push({
      code: 'UnexpectedToken',
      message: 'Duplicate @recipe header — only one is allowed',
      loc: c.spanFrom(start),
    });
    return true;
  }
  if (state.blocks.length > 0 || state.yieldDecl !== undefined) {
    state.errors.push({
      code: 'MissingRecipeHeader',
      message: '@recipe must be the first non-blank block',
      loc: c.spanFrom(start),
    });
    return true;
  }
  header.loc = c.spanFrom(start);
  state.recipe = header;
  state.recipeLoc = header.loc;
  return true;
}

export function handleYield(state: ParserState, start: CursorMark): boolean {
  const { c } = state;
  const decl = parseYieldArgs(c, state.errors);
  if (decl === null) return true;
  if (state.yieldDecl !== undefined) {
    state.errors.push({
      code: 'UnexpectedToken',
      message: 'Duplicate @yield — only one is allowed',
      loc: c.spanFrom(start),
    });
    return true;
  }
  if (state.recipe === undefined) {
    state.errors.push({
      code: 'MissingRecipeHeader',
      message: '@yield must follow an @recipe header',
      loc: c.spanFrom(start),
    });
  }
  decl.loc = c.spanFrom(start);
  state.yieldDecl = decl;
  state.yieldLoc = decl.loc;
  return true;
}

export function handleIngredient(state: ParserState, start: CursorMark): boolean {
  const { c } = state;
  const block = parseIngredientArgs(c, state.errors);
  if (block === null) return true;
  ensureContext(state, start);
  const loc = c.spanFrom(start);
  const ing: IngredientBlock = { ...block, loc };
  if (state.seenIndexes.has(ing.index)) {
    state.errors.push({
      code: 'DuplicateIngredientIndex',
      message: `@ingredient index ${ing.index} is already used`,
      loc,
    });
    return true;
  }
  state.seenIndexes.add(ing.index);
  state.blocks.push(ing);
  return true;
}

export function handleStep(state: ParserState, start: CursorMark): boolean {
  const { c } = state;
  const block = parseStepArgs(c, state.errors);
  if (block === null) return true;
  ensureContext(state, start);
  state.blocks.push({ ...block, loc: c.spanFrom(start) });
  return true;
}

function ensureContext(state: ParserState, start: CursorMark): void {
  if (state.recipe === undefined) {
    state.errors.push({
      code: 'MissingRecipeHeader',
      message: '@ingredient / @step appear before @recipe header',
      loc: { startLine: start.line, startCol: start.col, endLine: start.line, endCol: start.col },
    });
  }
}
