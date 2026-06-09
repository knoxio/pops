/**
 * Recipe DSL AST. See ADR-023 for the grammar. Drizzle-independent:
 * the parser is pure text processing and emits these shapes verbatim.
 * The resolver turns slug references into entity ids; compile materialises
 * into `recipe_lines` / `recipe_steps`.
 */

/** 1-indexed source position used in editor diagnostics. */
export interface SourceSpan {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface QtyUnit {
  qty: number;
  unit: string;
}

export interface Descriptor {
  /** Required: the ingredient (or recipe) slug. */
  ingredient: string;
  /** Optional: variant slug scoped under `ingredient`. */
  variant?: string;
  /** Optional: prep-state slug (orthogonal modifier). */
  prep?: string;
}

export type RecipeTypeLiteral =
  | 'plate'
  | 'component'
  | 'technique'
  | 'sauce'
  | 'dressing'
  | 'drink'
  | 'condiment';

export interface RecipeHeader {
  slug: string;
  title: string;
  servings?: number;
  prepTime?: QtyUnit;
  cookTime?: QtyUnit;
  recipeType?: RecipeTypeLiteral;
  summary?: string;
  loc?: SourceSpan;
}

export interface YieldDecl {
  descriptor: Descriptor;
  /** qty=0 with unit='none' marks a non-yielding recipe (e.g. a technique). */
  qty: QtyUnit;
  loc?: SourceSpan;
}

export interface IngredientBlock {
  kind: 'ingredient';
  /** Author-assigned integer index, unique within the file. */
  index: number;
  descriptor: Descriptor;
  qty: QtyUnit;
  optional?: boolean;
  notes?: string;
  loc?: SourceSpan;
}

export interface StepBlock {
  kind: 'step';
  body: StepBody;
  duration?: QtyUnit;
  temperature?: QtyUnit;
  loc?: SourceSpan;
}

export interface MarkdownBlock {
  kind: 'markdown';
  text: string;
  loc?: SourceSpan;
}

export type AstBlock = IngredientBlock | StepBlock | MarkdownBlock;

export type StepBodyPart =
  | { kind: 'text'; value: string }
  /** `@N` (ingredient index) or `@slug` (any registered slug). */
  | { kind: 'ref'; ref: number | string }
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };

export type StepBody = StepBodyPart[];

export interface RecipeAst {
  recipe: RecipeHeader;
  yield: YieldDecl;
  blocks: AstBlock[];
}
