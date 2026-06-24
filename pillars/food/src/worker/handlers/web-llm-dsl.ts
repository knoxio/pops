/**
 * DSL builder for the LLM-extracted recipe
 * (`pillars/food/docs/prds/web-llm-fallback`).
 *
 * Pure function: `ExtractedRecipe` → DSL string
 * (`pillars/food/docs/prds/dsl-parser`). Scoped to the web-llm handler;
 * `build-dsl.ts` and `screenshot-dsl.ts` carry parallel copies of the
 * same shape.
 *
 * Invariants worth knowing:
 *   - Slug derivation is best-effort kebab-case; collision is the
 *     compiler's problem, not this pure function's.
 *   - `prep_state_slug` outside the curated list is pushed to `notes`,
 *     original preserved.
 *   - Step bodies that contain `@<slug>` references pass through
 *     verbatim — the grammar accepts both `@N` and `@slug`.
 */
import { isCuratedPrepState } from './web-llm-recipe.js';

import type { ExtractedIngredient, ExtractedRecipe } from './web-llm-recipe.js';

export interface BuildWebLlmDslOptions {
  source: 'url-web';
  url: string;
}

export interface BuildWebLlmDslResult {
  dsl: string;
  slug: string;
  prepFallbackCount: number;
}

const NON_KEBAB_RE = /[^a-z0-9-]+/g;
const DUP_DASH_RE = /-+/g;
const EDGE_DASH_RE = /^-+|-+$/g;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(NON_KEBAB_RE, '')
    .replace(DUP_DASH_RE, '-')
    .replace(EDGE_DASH_RE, '');
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

interface RenderedIngredient {
  line: string;
  prepFallback: boolean;
}

function renderIngredient(idx: number, ing: ExtractedIngredient): RenderedIngredient {
  const args: string[] = [String(idx), ing.ingredient_slug];
  if (ing.variant_slug != null && ing.variant_slug !== '') {
    args.push(`variant="${escapeQuoted(ing.variant_slug)}"`);
  }
  let prepFallback = false;
  const notesParts: string[] = [];
  if (ing.prep_state_slug != null && ing.prep_state_slug !== '') {
    if (isCuratedPrepState(ing.prep_state_slug)) {
      args.push(`prep="${escapeQuoted(ing.prep_state_slug)}"`);
    } else {
      prepFallback = true;
      notesParts.push(`prep: ${ing.prep_state_slug}`);
    }
  }
  args.push(`qty=${formatNumber(ing.qty)}`);
  args.push(`unit="${escapeQuoted(ing.unit)}"`);
  if (ing.optional === true) args.push('optional=true');
  if (ing.notes != null && ing.notes !== '') notesParts.push(ing.notes);
  if (notesParts.length > 0) {
    args.push(`notes="${escapeQuoted(notesParts.join('; '))}"`);
  }
  return { line: `@ingredient(${args.join(', ')})`, prepFallback };
}

function renderRecipeHeader(recipe: ExtractedRecipe, slug: string): string {
  const args: string[] = [
    `slug="${escapeQuoted(slug)}"`,
    `title="${escapeQuoted(recipe.title)}"`,
    `servings=${formatNumber(recipe.servings)}`,
  ];
  if (recipe.prep_time_minutes != null && recipe.prep_time_minutes > 0) {
    args.push(`prep_time=${formatNumber(recipe.prep_time_minutes)}:min`);
  }
  if (recipe.cook_time_minutes != null && recipe.cook_time_minutes > 0) {
    args.push(`cook_time=${formatNumber(recipe.cook_time_minutes)}:min`);
  }
  return `@recipe(\n  ${args.join(',\n  ')}\n)`;
}

/**
 * Builds the DSL string for a Claude-extracted recipe. Returns
 * the DSL plus the derived slug + a count of how many ingredients had
 * their `prep_state_slug` rewritten into `notes` (surfaced in meta JSON
 * so the review queue can show the operator what was rerouted).
 */
export function buildWebLlmDsl(
  recipe: ExtractedRecipe,
  _opts: BuildWebLlmDslOptions
): BuildWebLlmDslResult {
  const slug = slugify(recipe.title) || 'untitled-recipe';
  const lines: string[] = [];
  lines.push(renderRecipeHeader(recipe, slug));
  lines.push(
    `@yield(${recipe.yield_slug}, ${formatNumber(recipe.yield_qty)}:${recipe.yield_unit})`
  );
  let prepFallbackCount = 0;
  recipe.ingredients.forEach((ing, i) => {
    const rendered = renderIngredient(i + 1, ing);
    lines.push(rendered.line);
    if (rendered.prepFallback) prepFallbackCount += 1;
  });
  for (const step of recipe.steps) {
    lines.push(`@step("${escapeQuoted(step.body)}")`);
  }
  return { dsl: `${lines.join('\n')}\n`, slug, prepFallbackCount };
}
