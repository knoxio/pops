/**
 * PRD-127 — JSON-LD → DSL mapping.
 *
 * Pure deterministic transformation. Given a parsed JSON-LD Recipe node
 * and a (possibly empty) reserved-slug set, builds a DSL string that
 * parses without errors. The reserved-slug set lets the caller wire the
 * existing `slug_registry` for collision suffixing — when the set is
 * empty (offline test runs) we still produce a parseable DSL.
 */
import { extractInstructionTexts } from './extract-instructions.js';
import { parseDurationMinutes } from './parse-duration.js';
import { parseIngredientLine } from './parse-ingredient-line.js';
import { parseYield } from './parse-yield.js';
import { disambiguateSlug, slugify } from './slugify.js';

import type { RecipeJsonLd } from './extract-json-ld.js';

export interface MapResult {
  dsl: string;
  /** Resolved recipe slug (post-collision suffixing). */
  slug: string;
  /** Stats for the meta JSON `mapping` stage. */
  stats: {
    ingredients: number;
    steps: number;
    tags: number;
  };
}

export interface MapOptions {
  /** Slugs already present in `slug_registry`; used to suffix collisions. */
  reservedSlugs?: ReadonlySet<string>;
}

export function mapJsonLdToDsl(jsonLd: RecipeJsonLd, options: MapOptions = {}): MapResult {
  const reserved = options.reservedSlugs ?? new Set<string>();
  const title = pickFirstString(jsonLd.name) ?? 'Untitled Recipe';
  const baseSlug = slugify(title);
  const slug = disambiguateSlug(baseSlug, reserved);

  const header = buildRecipeHeader({
    slug,
    title,
    summary: pickFirstString(jsonLd.description),
    servings: parseYield(jsonLd.recipeYield).qty,
    prepMins: parseDurationMinutes(jsonLd.prepTime),
    cookMins: parseDurationMinutes(jsonLd.cookTime),
  });

  const yieldDecl = buildYield(slug, jsonLd.recipeYield);

  const ingredientLines = collectIngredientLines(jsonLd.recipeIngredient);
  const ingredientBlocks = ingredientLines.map((line, idx) => buildIngredient(idx + 1, line));

  const instructions = extractInstructionTexts(jsonLd.recipeInstructions);
  const stepBlocks = instructions.map((text) => `@step("${escapeQuoted(text)}")`);

  const tagBlocks = buildTags(jsonLd.recipeCategory, jsonLd.recipeCuisine);

  const lines = [header, yieldDecl, ...ingredientBlocks, ...stepBlocks];
  if (tagBlocks.length > 0) lines.push(...tagBlocks);

  return {
    dsl: lines.join('\n') + '\n',
    slug,
    stats: {
      ingredients: ingredientBlocks.length,
      steps: stepBlocks.length,
      tags: tagBlocks.length,
    },
  };
}

interface HeaderArgs {
  slug: string;
  title: string;
  summary: string | null;
  servings: number;
  prepMins: number | null;
  cookMins: number | null;
}

function buildRecipeHeader(args: HeaderArgs): string {
  const parts = [
    `slug="${escapeQuoted(args.slug)}"`,
    `title="${escapeQuoted(args.title)}"`,
    `servings=${args.servings}`,
  ];
  if (args.prepMins !== null) parts.push(`prep_time=${args.prepMins}:min`);
  if (args.cookMins !== null) parts.push(`cook_time=${args.cookMins}:min`);
  if (args.summary !== null && args.summary.trim().length > 0) {
    parts.push(`summary="${escapeQuoted(args.summary.trim())}"`);
  }
  return `@recipe(${parts.join(', ')})`;
}

function buildYield(slug: string, recipeYieldField: unknown): string {
  const { qty, unit } = parseYield(recipeYieldField);
  return `@yield(${slug}, ${qty}:${unit})`;
}

function buildIngredient(index: number, line: string): string {
  const parsed = parseIngredientLine(line);
  return `@ingredient(${index}, ${parsed.descriptorSlug}, ${parsed.qty}:${parsed.unit})`;
}

function buildTags(category: unknown, cuisine: unknown): string[] {
  const out: string[] = [];
  for (const value of [category, cuisine]) {
    const strings = collectStrings(value);
    for (const s of strings) {
      const tag = slugify(s);
      if (tag !== '') out.push(`// tag: ${tag}`);
    }
  }
  return out;
}

function collectIngredientLines(value: unknown): string[] {
  const out: string[] = [];
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') out.push(item);
    }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') out.push(item);
    }
    return out;
  }
  return [];
}

function pickFirstString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = pickFirstString(item);
      if (r !== null) return r;
    }
  }
  return null;
}

function escapeQuoted(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
