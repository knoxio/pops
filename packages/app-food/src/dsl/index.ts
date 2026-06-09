/**
 * Public surface of the recipe DSL parser — PRD-114.
 *
 * Downstream PRDs import from `@pops/app-food` (or directly from
 * `./dsl/parser` / `./dsl/ast` / `./dsl/printer` inside this package).
 */
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
} from './ast';
export type { ParseError, ParseErrorCode } from './errors';
export { parseRecipeDsl, type ParseResult } from './parser';
export { printRecipeAst } from './printer';
export { resolveRecipeAst } from './resolver';
export type {
  ProposedSlug,
  ResolveContext,
  ResolveError,
  ResolveErrorCode,
  ResolveResult,
  ResolvedBlock,
  ResolvedIngredientBlock,
  ResolvedMarkdownBlock,
  ResolvedRecipeAst,
  ResolvedStepBlock,
  ResolvedStepBody,
  ResolvedStepBodyPart,
  ResolvedYield,
  ResolverCreation,
} from './resolver-types';
export { detectRecipeCycle } from './cycle';
export type { CycleContext, CycleDescription, CycleError, CycleResult } from './cycle-types';
export { compileRecipeVersion } from './compile';
export type {
  CompileError,
  CompileErrorJson,
  CompilePhase,
  CompileResult,
  MaterialiseError,
} from './compile-types';
