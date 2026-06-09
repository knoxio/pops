/**
 * PRD-127 — JSON-LD extraction.
 *
 * Walks every `<script type="application/ld+json">` block in the HTML,
 * parses each independently (a single malformed block must not poison
 * the others), and returns the FIRST node whose `@type` is `Recipe`.
 *
 * Real-world recipe sites embed their JSON-LD in several wrappers:
 *   - A single Recipe node.
 *   - An array of typed nodes.
 *   - A `@graph` envelope (`{ "@context": ..., "@graph": [...] }`).
 *   - A nested `mainEntity` / `mainEntityOfPage` slot.
 *
 * The walker descends through all four, lazily, and stops on the first
 * Recipe hit. Returning `null` is the signal PRD-128's LLM fallback uses
 * to take over.
 */

const SCRIPT_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

export interface RecipeJsonLd {
  '@type'?: unknown;
  '@context'?: unknown;
  name?: unknown;
  description?: unknown;
  image?: unknown;
  author?: unknown;
  recipeYield?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  totalTime?: unknown;
  recipeCategory?: unknown;
  recipeCuisine?: unknown;
  recipeIngredient?: unknown;
  recipeInstructions?: unknown;
  nutrition?: unknown;
  [key: string]: unknown;
}

export function extractRecipeJsonLd(html: string): RecipeJsonLd | null {
  const blocks = collectScriptBlocks(html);
  for (const block of blocks) {
    const parsed = safeParseJson(block);
    if (parsed === null) continue;
    const recipe = findRecipeNode(parsed);
    if (recipe !== null) return recipe;
  }
  return null;
}

function collectScriptBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(SCRIPT_RE.source, SCRIPT_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
  }
  return blocks;
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Depth-first walk over the JSON-LD tree looking for the first node whose
 * `@type` is (or contains) "Recipe". We do NOT recurse into arbitrary keys
 * — only the schema.org envelope slots (`@graph`, `mainEntity`,
 * `mainEntityOfPage`, `itemReviewed`) plus raw arrays.
 */
function findRecipeNode(value: unknown): RecipeJsonLd | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;

  if (matchesRecipeType(value['@type'])) {
    return value as RecipeJsonLd;
  }

  for (const slot of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemReviewed'] as const) {
    const inner = value[slot];
    if (inner !== undefined) {
      const found = findRecipeNode(inner);
      if (found !== null) return found;
    }
  }
  return null;
}

function matchesRecipeType(type: unknown): boolean {
  if (typeof type === 'string') return type === 'Recipe' || type.endsWith('/Recipe');
  if (Array.isArray(type)) return type.some((t) => matchesRecipeType(t));
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
