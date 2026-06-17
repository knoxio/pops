/**
 * Public browser-safe DSL surface — `@pops/food/dsl`.
 *
 * Pure parser + AST types ONLY. No resolver / compile / cycle (those need
 * a `FoodDb` and run server-side) and no drizzle / node imports, so this
 * is safe to bundle into the food FE. Consumers: the CodeMirror editor's
 * lint mapping (`SourceSpan`) and the Lezer-grammar parity test
 * (`parseRecipeDsl` + `RecipeAst`).
 */
export { parseRecipeDsl, type ParseResult } from './parser.js';
export type { ParseError, ParseErrorCode } from './errors.js';
export type {
  AstBlock,
  Descriptor,
  IngredientBlock,
  MarkdownBlock,
  QtyUnit,
  RecipeAst,
  RecipeHeader,
  RecipeTypeLiteral,
  SourceSpan,
  StepBlock,
  StepBody,
  StepBodyPart,
  YieldDecl,
} from './ast.js';
