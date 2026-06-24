import {
  PREP_STATE_SLUGS,
  slugify,
  type ExtractedIngredient,
  type ExtractedRecipe,
  type ExtractedStep,
  type PrepStateSlug,
} from './extracted-recipe.js';

/**
 * Source tag flows into `summary` annotations + future telemetry on the
 * `ingest_sources` row. Kept narrow so callers can't accidentally pass
 * an arbitrary string.
 */
export type DslSource = 'url-web' | 'text' | 'screenshot' | 'ig-text-fallback' | 'ig-vision';

export interface BuildDslOptions {
  source: DslSource;
  /** Optional original URL — appears in the recipe summary when present. */
  url?: string;
  /** Override the recipe slug when caller already resolved a collision. */
  slug?: string;
}

const PREP_STATE_SET = new Set<PrepStateSlug>(PREP_STATE_SLUGS);

function isCuratedPrep(value: string | undefined): value is PrepStateSlug {
  if (!value) return false;
  return PREP_STATE_SET.has(value as PrepStateSlug);
}

function escapeDslString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(3)).toString();
}

function formatQtyUnit(qty: number, unit: string): string {
  const unitSlug = slugify(unit) || 'count';
  return `${formatNumber(qty)}:${unitSlug}`;
}

function buildDescriptor(ingredient: ExtractedIngredient): {
  descriptor: string;
  prepInNotes: string | undefined;
} {
  const segments: string[] = [ingredient.ingredient_slug];
  const variant = ingredient.variant_slug;
  const prepRaw = ingredient.prep_state_slug;
  const curatedPrep = isCuratedPrep(prepRaw) ? prepRaw : undefined;
  const prepInNotes = prepRaw && !curatedPrep ? prepRaw : undefined;

  if (variant && curatedPrep) {
    segments.push(variant, curatedPrep);
  } else if (variant) {
    segments.push(variant);
  } else if (curatedPrep) {
    segments.push('_', curatedPrep);
  }
  return { descriptor: segments.join(':'), prepInNotes };
}

function buildIngredientLine(ingredient: ExtractedIngredient, index: number): string {
  const { descriptor, prepInNotes } = buildDescriptor(ingredient);
  const qtyUnit = formatQtyUnit(ingredient.qty, ingredient.unit);
  const named: string[] = [];
  if (ingredient.optional) named.push('optional=true');
  const noteParts: string[] = [];
  if (ingredient.notes) noteParts.push(ingredient.notes);
  if (prepInNotes) noteParts.push(`prep: ${prepInNotes}`);
  if (ingredient.original_text && ingredient.original_text !== ingredient.ingredient_slug) {
    noteParts.push(`source: ${ingredient.original_text}`);
  }
  if (noteParts.length > 0) {
    named.push(`notes="${escapeDslString(noteParts.join(' — '))}"`);
  }
  const tail = named.length > 0 ? `, ${named.join(', ')}` : '';
  return `@ingredient(${index}, ${descriptor}, ${qtyUnit}${tail})`;
}

function buildStepLine(step: ExtractedStep): string {
  const named: string[] = [];
  if (step.duration_minutes != null && Number.isFinite(step.duration_minutes)) {
    named.push(`duration=${formatQtyUnit(step.duration_minutes, 'min')}`);
  }
  const tail = named.length > 0 ? `, ${named.join(', ')}` : '';
  return `@step("${escapeDslString(step.body)}"${tail})`;
}

function deriveYieldSlug(parsed: ExtractedRecipe, recipeSlug: string): string {
  const explicit = parsed.yield_slug;
  if (explicit && explicit !== '') return explicit;
  return recipeSlug;
}

function buildRecipeHeaderArgs(
  parsed: ExtractedRecipe,
  recipeSlug: string,
  opts: BuildDslOptions
): string[] {
  const args: string[] = [`slug=${recipeSlug}`, `title="${escapeDslString(parsed.title)}"`];
  if (parsed.servings != null && Number.isFinite(parsed.servings)) {
    args.push(`servings=${formatNumber(parsed.servings)}`);
  }
  if (parsed.prep_time_minutes != null && Number.isFinite(parsed.prep_time_minutes)) {
    args.push(`prep_time=${formatQtyUnit(parsed.prep_time_minutes, 'min')}`);
  }
  if (parsed.cook_time_minutes != null && Number.isFinite(parsed.cook_time_minutes)) {
    args.push(`cook_time=${formatQtyUnit(parsed.cook_time_minutes, 'min')}`);
  }
  const summary = composeSummary(parsed, opts);
  if (summary) args.push(`summary="${escapeDslString(summary)}"`);
  return args;
}

function composeSummary(parsed: ExtractedRecipe, opts: BuildDslOptions): string | undefined {
  // The text prompt instructs the LLM to mark rough-idea elaborations in
  // `summary` itself; trust the model's signal rather than inferring
  // "rough idea" from an empty `ingredients` array (which actually means
  // a partial / failed extraction — those land in the review queue with
  // `partialReason='empty-extraction'`, not as rough ideas).
  const parts: string[] = [];
  if (parsed.summary && parsed.summary.trim() !== '') parts.push(parsed.summary.trim());
  if (opts.url) parts.push(`Source: ${opts.url}`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Render the LLM-extracted recipe as a recipe-DSL string
 * (`pillars/food/docs/prds/dsl-parser`). Pure function — no DB lookups,
 * no slug-collision suffixing here (recipe create owns that via
 * `slug_registry`; see `pillars/food/docs/prds/recipe-model`).
 *
 * Invariants:
 *   - First non-comment line is `@recipe(...)`.
 *   - `@yield(...)` follows immediately.
 *   - Ingredients indexed sequentially from 1.
 *   - Descriptors use `_` to skip variant when only `prep` is set.
 *   - Non-curated `prep_state_slug` values are pushed to `notes`.
 *   - Step bodies emitted verbatim (the prompt may already embed
 *     `@<slug>` inline references — the DSL parser handles those).
 */
export function buildDsl(parsed: ExtractedRecipe, opts: BuildDslOptions): string {
  const recipeSlug = opts.slug ?? slugify(parsed.title) ?? 'recipe';
  const finalSlug = recipeSlug === '' ? 'recipe' : recipeSlug;
  const headerArgs = buildRecipeHeaderArgs(parsed, finalSlug, opts);

  const yieldDescriptor = deriveYieldSlug(parsed, finalSlug);
  const yieldQty =
    parsed.yield_qty != null && Number.isFinite(parsed.yield_qty) ? parsed.yield_qty : 1;
  const yieldUnit =
    parsed.yield_unit && parsed.yield_unit.trim() !== '' ? parsed.yield_unit : 'serving';
  const yieldLine = `@yield(${yieldDescriptor}, ${formatQtyUnit(yieldQty, yieldUnit)})`;

  const ingredientLines = parsed.ingredients.map((ing, i) => buildIngredientLine(ing, i + 1));
  const stepLines = parsed.steps.map(buildStepLine);

  const lines = [`@recipe(${headerArgs.join(', ')})`, yieldLine, '', ...ingredientLines];
  if (stepLines.length > 0) {
    lines.push('', ...stepLines);
  }
  return lines.join('\n') + '\n';
}
