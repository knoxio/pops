/**
 * Shared zod building blocks for the deep `recipes.*` REST response shapes:
 * the DSL `SourceSpan`, the compile-pipeline `CompileResult`, and the
 * `getForRendering` aggregate (`RecipeVersionWithCompiledData`).
 *
 * These mirror the in-pillar domain/dsl/db types verbatim so the generated
 * `api-types` fully describes the wire shape — the food FE consumes these
 * instead of importing the pillar's internal types. Split from
 * `rest-recipes.ts` to keep that file under the per-file line cap. Zod-only;
 * no imports from `src/api/` or `src/db/`.
 *
 * Source of truth:
 * - `SourceSpan`               → `src/dsl/ast.ts`
 * - `CompileResult` / errors   → `src/dsl/compile-types.ts` (+ `errors.ts`,
 *                                `resolver-types.ts`, `cycle-types.ts`)
 * - row shapes                 → `src/db/schema/food-{recipes,compile,ingredients}.ts`
 * - aggregate                  → `src/domain/recipe-renderer-types.ts`
 */
import { z } from 'zod';

const CanonicalUnit = z.enum(['g', 'ml', 'count']);
const RecipeTypeLiteral = z.enum([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);
const CompileStatus = z.enum(['uncompiled', 'compiled', 'failed']);

export const SourceSpanSchema = z.object({
  startLine: z.number().int(),
  startCol: z.number().int(),
  endLine: z.number().int(),
  endCol: z.number().int(),
});

const CompilePhase = z.enum(['parse', 'resolve', 'cycle', 'materialise']);

const CompileErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  loc: SourceSpanSchema.optional(),
  cause: z.string().optional(),
  slug: z.string().optional(),
});

export const CompileResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    lineCount: z.number().int(),
    stepCount: z.number().int(),
    creationCount: z.number().int(),
  }),
  z.object({
    ok: z.literal(false),
    phase: CompilePhase,
    errors: z.array(CompileErrorSchema).readonly(),
  }),
]);

const RecipeRowSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  recipeType: RecipeTypeLiteral,
  currentVersionId: z.number().int().nullable(),
  heroImagePath: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

const RecipeVersionRowSchema = z.object({
  id: z.number().int(),
  recipeId: z.number().int(),
  versionNo: z.number().int(),
  status: z.enum(['draft', 'current', 'archived']),
  title: z.string(),
  summary: z.string().nullable(),
  bodyDsl: z.string(),
  yieldIngredientId: z.number().int().nullable(),
  yieldVariantId: z.number().int().nullable(),
  yieldPrepStateId: z.number().int().nullable(),
  yieldQty: z.number().nullable(),
  yieldUnit: z.string().nullable(),
  servings: z.number().int().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  sourceId: z.number().int().nullable(),
  compileStatus: CompileStatus,
  compileError: z.string().nullable(),
  compiledAt: z.string().nullable(),
  createdAt: z.string(),
});

const RecipeStepRowSchema = z.object({
  id: z.number().int(),
  recipeVersionId: z.number().int(),
  position: z.number().int(),
  bodyMd: z.string(),
  bodyResolvedJson: z.string(),
  durationMinutes: z.number().int().nullable(),
  temperatureValue: z.number().nullable(),
  temperatureUnit: z.enum(['c', 'f', 'gas']).nullable(),
});

const IngredientRowSchema = z.object({
  id: z.number().int(),
  parentId: z.number().int().nullable(),
  name: z.string(),
  slug: z.string(),
  defaultUnit: CanonicalUnit,
  densityGPerMl: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

const IngredientVariantRowSchema = z.object({
  id: z.number().int(),
  ingredientId: z.number().int(),
  name: z.string(),
  slug: z.string(),
  defaultUnit: CanonicalUnit,
  packageSizeG: z.number().nullable(),
  notes: z.string().nullable(),
  defaultShelfLifeDaysFridge: z.number().int().nullable(),
  defaultShelfLifeDaysFreezer: z.number().int().nullable(),
  createdAt: z.string(),
});

const PrepStateRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});

const RecipeLineWithResolvedSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  ingredientId: z.number().int(),
  variantId: z.number().int().nullable(),
  prepStateId: z.number().int().nullable(),
  isRecipeRef: z.boolean(),
  recipeRefId: z.number().int().nullable(),
  originalText: z.string(),
  originalQty: z.number(),
  originalUnit: z.string(),
  qtyG: z.number().nullable(),
  qtyMl: z.number().nullable(),
  qtyCount: z.number().nullable(),
  canonicalUnit: CanonicalUnit,
  optional: z.boolean(),
  notes: z.string().nullable(),
  ingredientName: z.string(),
  ingredientSlug: z.string(),
  variantName: z.string().nullable(),
  variantSlug: z.string().nullable(),
  prepStateName: z.string().nullable(),
  prepStateSlug: z.string().nullable(),
  recipeRefSlug: z.string().nullable(),
  recipeRefTitle: z.string().nullable(),
});

export const RecipeVersionWithCompiledDataSchema = z.object({
  version: RecipeVersionRowSchema,
  recipe: RecipeRowSchema,
  lines: z.array(RecipeLineWithResolvedSchema),
  steps: z.array(RecipeStepRowSchema),
  yieldIngredient: IngredientRowSchema.nullable(),
  yieldVariant: IngredientVariantRowSchema.nullable(),
  yieldPrepState: PrepStateRowSchema.nullable(),
  tags: z.array(z.string()),
});
