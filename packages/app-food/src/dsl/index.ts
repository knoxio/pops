// Re-export shim — the DSL pipeline lives in `@pops/app-food-db` so the
// backend can compile/parse without dragging React + CodeMirror in. The
// Lezer grammar + CodeMirror language extension stay in this package.
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
} from '@pops/app-food-db';
export type { ParseError, ParseErrorCode } from '@pops/app-food-db';
export { parseRecipeDsl, type ParseResult } from '@pops/app-food-db';
export { printRecipeAst } from '@pops/app-food-db';
export { resolveRecipeAst } from '@pops/app-food-db';
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
} from '@pops/app-food-db';
export { detectRecipeCycle } from '@pops/app-food-db';
export type { CycleContext, CycleDescription, CycleError, CycleResult } from '@pops/app-food-db';
export { compileRecipeVersion } from '@pops/app-food-db';
export type {
  CompileError,
  CompileErrorJson,
  CompilePhase,
  CompileResult,
  MaterialiseError,
} from '@pops/app-food-db';
