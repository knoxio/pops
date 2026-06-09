import { z } from 'zod';

/**
 * Curated prep-state list per PRD-128 §Step 2 / PRD-132 §Prompt. Slugs
 * outside this list get pushed into the ingredient `notes` field by
 * `buildDsl` instead of being emitted as a descriptor segment.
 */
export const PREP_STATE_SLUGS = [
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

export type PrepStateSlug = (typeof PREP_STATE_SLUGS)[number];

const COMBINING_MARKS_RE = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

const numericLike = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  if (trimmed === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'empty numeric value' });
    return z.NEVER;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not a number: ${value}` });
    return z.NEVER;
  }
  return parsed;
});

const optionalNumericLike = numericLike.optional();

const slugSchema = z
  .string()
  .min(1)
  .transform(slugify)
  .refine((s) => SLUG_RE.test(s), { message: 'invalid slug' });

const optionalSlugSchema = z
  .string()
  .optional()
  .transform((s) => {
    if (s == null || s === '') return undefined;
    const cleaned = slugify(s);
    return cleaned === '' ? undefined : cleaned;
  })
  .refine((s) => s === undefined || SLUG_RE.test(s), { message: 'invalid slug' });

const ingredientSchema = z.object({
  qty: numericLike,
  unit: z.string().min(1),
  ingredient_slug: slugSchema,
  variant_slug: optionalSlugSchema,
  prep_state_slug: z.string().optional(),
  original_text: z.string().optional(),
  optional: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const stepSchema = z.object({
  body: z.string().min(1),
  duration_minutes: optionalNumericLike,
});

export const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  servings: optionalNumericLike,
  prep_time_minutes: optionalNumericLike,
  cook_time_minutes: optionalNumericLike,
  yield_slug: optionalSlugSchema,
  yield_qty: optionalNumericLike,
  yield_unit: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(stepSchema).default([]),
});

export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;
export type ExtractedIngredient = ExtractedRecipe['ingredients'][number];
export type ExtractedStep = ExtractedRecipe['steps'][number];
