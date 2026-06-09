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
} from './ast.js';
export type { ParseError, ParseErrorCode } from './errors.js';
export { parseRecipeDsl, type ParseResult } from './parser.js';
export { printRecipeAst } from './printer.js';
export { resolveRecipeAst } from './resolver.js';
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
} from './resolver-types.js';
export { detectRecipeCycle } from './cycle.js';
export type { CycleContext, CycleDescription, CycleError, CycleResult } from './cycle-types.js';
export { compileRecipeVersion } from './compile.js';
export type {
  CompileError,
  CompileErrorJson,
  CompilePhase,
  CompileResult,
  MaterialiseError,
} from './compile-types.js';
