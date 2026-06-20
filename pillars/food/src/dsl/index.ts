/**
 * Internal barrel for the recipe DSL pipeline (PRDs 114-117, 123).
 *
 * Pure logic — no drizzle or database imports. Parser, resolver, cycle
 * detector, compiler, normaliser. Consumers (`api/`, `worker/`, the
 * `app-food` FE module via the public package surface) import from here
 * relatively; nothing in this barrel is re-exported on the pillar's
 * public exports map.
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
export { normaliseLineQty } from './normalisation.js';
