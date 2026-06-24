/**
 * Zod schema + DSL builder for the screenshot ingest path
 * (`pillars/food/docs/prds/screenshot-ingest`).
 *
 * This shape is duplicated across the sibling ingest handlers
 * (`build-dsl.ts`, `web-llm-dsl.ts`) — same schema, parallel copies.
 * Hoist `parsedRecipeSchema` + `buildDsl` into a shared module if a
 * fourth consumer appears.
 */
import { z } from 'zod';

/** Approved prep states — reject anything else. */
const ALLOWED_PREP_STATES = [
  'whole',
  'diced',
  'sliced',
  'chopped',
  'shredded',
  'minced',
  'julienned',
  'grated',
  'crushed',
  'zested',
  'juiced',
  'melted',
  'softened',
  'mashed',
  'roughly-chopped',
] as const;

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, 'expected kebab-case slug');

const ingredientSchema = z.object({
  qty: z.number(),
  unit: z.string().min(1),
  ingredient_slug: slugSchema,
  variant_slug: slugSchema.optional(),
  prep_state_slug: z.enum(ALLOWED_PREP_STATES).optional(),
  original_text: z.string().optional().default(''),
  optional: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const stepSchema = z.object({
  body: z.string().min(1),
  duration_minutes: z.number().nonnegative().optional(),
});

export const parsedRecipeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  servings: z.number().positive(),
  prep_time_minutes: z.number().nonnegative().optional(),
  cook_time_minutes: z.number().nonnegative().optional(),
  yield_slug: slugSchema,
  yield_qty: z.number().positive(),
  yield_unit: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
});

export type ParsedRecipe = z.infer<typeof parsedRecipeSchema>;

export interface BuildDslOpts {
  source: 'screenshot' | 'text' | 'url-web' | 'url-instagram';
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || !/^[a-z]/.test(slug)) {
    return 'untitled-recipe';
  }
  return slug;
}

function escapeDslString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function descriptor(
  ingredient: string,
  variant: string | undefined,
  prep: string | undefined
): string {
  if (prep) return `${ingredient}:${variant ?? '_'}:${prep}`;
  if (variant) return `${ingredient}:${variant}`;
  return ingredient;
}

function qtyUnit(qty: number, unit: string): string {
  if (qty === 0) return '0:none';
  const trimmed = unit.trim().toLowerCase();
  if (!trimmed) return `${qty}:count`;
  const slugged = trimmed.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${qty}:${slugged || 'count'}`;
}

function renderHeader(parsed: ParsedRecipe): string {
  const slug = slugify(parsed.title);
  const args: string[] = [
    `slug="${escapeDslString(slug)}"`,
    `title="${escapeDslString(parsed.title)}"`,
    `servings=${parsed.servings}`,
  ];
  if (parsed.prep_time_minutes != null) {
    args.push(`prep_time=${qtyUnit(parsed.prep_time_minutes, 'min')}`);
  }
  if (parsed.cook_time_minutes != null) {
    args.push(`cook_time=${qtyUnit(parsed.cook_time_minutes, 'min')}`);
  }
  if (parsed.summary) {
    args.push(`summary="${escapeDslString(parsed.summary)}"`);
  }
  return `@recipe(${args.join(', ')})`;
}

function renderIngredient(ing: ParsedRecipe['ingredients'][number], index: number): string {
  const args: string[] = [
    String(index + 1),
    descriptor(ing.ingredient_slug, ing.variant_slug, ing.prep_state_slug),
    qtyUnit(ing.qty, ing.unit),
  ];
  if (ing.optional) args.push('optional=true');
  if (ing.notes) args.push(`notes="${escapeDslString(ing.notes)}"`);
  return `@ingredient(${args.join(', ')})`;
}

function renderStep(step: ParsedRecipe['steps'][number]): string {
  const args: string[] = [`"${escapeDslString(step.body)}"`];
  if (step.duration_minutes != null) {
    args.push(`duration=${qtyUnit(step.duration_minutes, 'min')}`);
  }
  return `@step(${args.join(', ')})`;
}

/**
 * Render a parsed recipe as a grammar-compliant DSL string
 * (`pillars/food/docs/prds/dsl-parser`).
 */
export function buildDsl(parsed: ParsedRecipe, _opts: BuildDslOpts): string {
  const lines: string[] = [
    renderHeader(parsed),
    `@yield(${parsed.yield_slug}, ${qtyUnit(parsed.yield_qty, parsed.yield_unit)})`,
    '',
  ];
  parsed.ingredients.forEach((ing, idx) => lines.push(renderIngredient(ing, idx)));
  if (parsed.ingredients.length > 0 && parsed.steps.length > 0) lines.push('');
  parsed.steps.forEach((step) => lines.push(renderStep(step)));
  return lines.join('\n');
}
