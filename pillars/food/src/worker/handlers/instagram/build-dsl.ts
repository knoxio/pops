import { disambiguateSlug, slugify } from '../web/slugify.js';

/**
 * Pure ExtractedRecipe → recipe DSL assembly (grammar in
 * pillars/food/docs/prds/dsl-parser): slug from title with `-2`/`-3`/...
 * collision suffixes against the reserved set, yield ingredient = recipe
 * slug, one `@ingredient` block per parsed entry, one `@step` per parsed
 * step.
 */
import type { ExtractedIngredient, ExtractedRecipe, ExtractedStep } from './extracted-recipe.js';

export interface BuildDslResult {
  dsl: string;
  slug: string;
  stats: { ingredients: number; steps: number };
}

export interface BuildDslOptions {
  reservedSlugs?: ReadonlySet<string>;
}

const VALID_SLUG_RE = /^[a-z][a-z0-9-]*$/;
const CURATED_PREP_STATES: ReadonlySet<string> = new Set([
  'raw',
  'cooked',
  'roasted',
  'grilled',
  'fried',
  'boiled',
  'steamed',
  'baked',
  'minced',
  'diced',
  'chopped',
  'sliced',
  'whole',
  'mashed',
  'ground',
]);

export function buildDsl(parsed: ExtractedRecipe, opts: BuildDslOptions = {}): BuildDslResult {
  const reserved = opts.reservedSlugs ?? new Set<string>();
  const baseSlug = slugify(parsed.title);
  const slug = disambiguateSlug(baseSlug, reserved);

  const lines: string[] = [];
  lines.push(buildRecipeHeader(parsed, slug));
  lines.push(`@yield(${slug}, ${parsed.servings ?? 4}:serving)`);
  parsed.ingredients.forEach((ing, idx) => {
    lines.push(buildIngredient(idx + 1, ing));
  });
  parsed.steps.forEach((step) => {
    lines.push(buildStep(step));
  });

  return {
    dsl: lines.join('\n') + '\n',
    slug,
    stats: { ingredients: parsed.ingredients.length, steps: parsed.steps.length },
  };
}

function buildRecipeHeader(parsed: ExtractedRecipe, slug: string): string {
  const parts = [`slug="${escapeQuoted(slug)}"`, `title="${escapeQuoted(parsed.title)}"`];
  if (parsed.servings != null) parts.push(`servings=${parsed.servings}`);
  else parts.push('servings=4');
  if (parsed.prep_time_min != null && parsed.prep_time_min > 0) {
    parts.push(`prep_time=${Math.round(parsed.prep_time_min)}:min`);
  }
  if (parsed.cook_time_min != null && parsed.cook_time_min > 0) {
    parts.push(`cook_time=${Math.round(parsed.cook_time_min)}:min`);
  }
  if (parsed.summary != null && parsed.summary.trim().length > 0) {
    parts.push(`summary="${escapeQuoted(parsed.summary.trim())}"`);
  }
  return `@recipe(${parts.join(', ')})`;
}

function buildIngredient(index: number, ing: ExtractedIngredient): string {
  const descriptor = buildDescriptor(ing);
  const qty = formatNumber(ing.qty);
  const unit = sanitiseSlug(ing.unit) ?? 'count';
  const tail =
    ing.notes != null && ing.notes.trim().length > 0
      ? `, notes="${escapeQuoted(ing.notes.trim())}"`
      : '';
  return `@ingredient(${index}, ${descriptor}, ${qty}:${unit}${tail})`;
}

function buildDescriptor(ing: ExtractedIngredient): string {
  const head = sanitiseSlug(ing.ingredient_slug) ?? 'ingredient';
  const variantSeg = ing.variant_slug != null ? sanitiseSlug(ing.variant_slug) : null;
  const prepSeg = ing.prep_state_slug != null ? sanitiseCuratedPrep(ing.prep_state_slug) : null;
  if (variantSeg == null && prepSeg == null) return head;
  const variant = variantSeg ?? '_';
  if (prepSeg == null) return `${head}:${variant}`;
  return `${head}:${variant}:${prepSeg}`;
}

function buildStep(step: ExtractedStep): string {
  const body = escapeQuoted(step.body.trim());
  const tail: string[] = [];
  if (step.duration_min != null && step.duration_min > 0) {
    tail.push(`duration=${formatNumber(step.duration_min)}:min`);
  }
  if (step.temperature_c != null) {
    tail.push(`temperature=${formatNumber(step.temperature_c)}:c`);
  }
  return tail.length > 0 ? `@step("${body}", ${tail.join(', ')})` : `@step("${body}")`;
}

function sanitiseSlug(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return null;
  if (VALID_SLUG_RE.test(trimmed)) return trimmed;
  const slug = slugify(trimmed);
  return slug === '' ? null : slug;
}

function sanitiseCuratedPrep(value: string): string | null {
  const slug = sanitiseSlug(value);
  if (slug === null) return null;
  return CURATED_PREP_STATES.has(slug) ? slug : null;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

function escapeQuoted(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
