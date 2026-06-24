/**
 * Ingredient-tag service layer.
 *
 * Tags are free-form strings under a namespaced convention
 * (`store-section:produce`, `diet:vegan`, …). Storage is the
 * `ingredient_tags(ingredient_id, tag)` many-to-many table; this module is
 * the only writer + the canonical reader for autocomplete + vocabulary
 * views. The plan-derived shopping generator reads
 * `listDistinctTags({ namespacePrefix: 'store-section' })` constantly so the
 * partial expression index on the namespace prefix
 * (`idx_ingredient_tags_namespace`) is load-bearing.
 *
 * Normalisation rules (applied on every write):
 *   1. Trim leading/trailing whitespace
 *   2. Lowercase
 *   3. Reject empty / whitespace-only with {@link BadTagFormat}
 *   4. Reject anything that doesn't match `^[a-z0-9_-]+(:[a-z0-9_-]+)*$`
 *   5. Reject > 64 characters with {@link TagTooLong}
 *
 * Reads accept the raw tag string and lowercase it before lookup — the
 * NOCASE collation on the index would let an upper-case lookup still hit,
 * but normalising at the boundary makes the contract explicit.
 */
import { and, asc, count, desc, eq, like, min, sql } from 'drizzle-orm';

import { BadTagFormat, IngredientNotFound, TagTooLong } from '../errors.js';
import { ingredients, ingredientTags } from '../schema.js';

import type { FoodDb } from './internal.js';

const MAX_TAG_LENGTH = 64;
const TAG_REGEX = /^[a-z0-9_-]+(:[a-z0-9_-]+)*$/;

export type TagErrorCode = 'BadTagFormat' | 'TagTooLong' | 'IngredientNotFound';

export type TagOpResult = { ok: true } | { ok: false; reason: TagErrorCode };

export interface TagDistinctRow {
  tag: string;
  ingredientCount: number;
  firstSeenAt: string;
}

export interface IngredientSummary {
  id: number;
  slug: string;
  name: string;
}

export interface ListDistinctTagsOptions {
  /**
   * Restrict the result to tags whose namespace prefix (segment before the
   * first `:`) matches. `null` returns every distinct tag. The prefix value
   * is matched verbatim — pass `'store-section'`, not `'store-section:'`.
   */
  namespacePrefix: string | null;
  /**
   * Cap on the number of rows returned. Defaults to 50 — the autocomplete
   * picker scrolls past the cap by re-querying. Tests pass higher values.
   */
  limit?: number;
}

/**
 * Normalise a raw tag input into the canonical stored form, or throw the
 * typed validation error. Exported so the request mapper can call it once
 * and surface a clean error to the client without round-tripping through
 * the service. Mutation paths re-normalise defensively.
 */
export function normaliseTag(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || !TAG_REGEX.test(trimmed)) {
    throw new BadTagFormat(raw);
  }
  if (trimmed.length > MAX_TAG_LENGTH) {
    throw new TagTooLong(trimmed, trimmed.length);
  }
  return trimmed;
}

function safeNormalise(
  raw: string
): { ok: true; tag: string } | { ok: false; reason: TagErrorCode } {
  try {
    return { ok: true, tag: normaliseTag(raw) };
  } catch (err) {
    if (err instanceof BadTagFormat) return { ok: false, reason: 'BadTagFormat' };
    if (err instanceof TagTooLong) return { ok: false, reason: 'TagTooLong' };
    throw err;
  }
}

function assertIngredientExists(db: FoodDb, ingredientId: number): void {
  const rows = db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(eq(ingredients.id, ingredientId))
    .all();
  if (rows.length === 0) {
    throw new IngredientNotFound(ingredientId);
  }
}

/**
 * Insert a single tag against the ingredient. Idempotent on the
 * `(ingredient_id, tag)` PK — re-inserting the same pair is a silent no-op.
 * Returns a structured result so callers can map `BadTagFormat` /
 * `TagTooLong` / `IngredientNotFound` to the right response code without
 * catching errors.
 */
export function addTagToIngredient(db: FoodDb, ingredientId: number, tag: string): TagOpResult {
  const norm = safeNormalise(tag);
  if (!norm.ok) return norm;
  try {
    assertIngredientExists(db, ingredientId);
  } catch (err) {
    if (err instanceof IngredientNotFound) return { ok: false, reason: 'IngredientNotFound' };
    throw err;
  }
  db.insert(ingredientTags).values({ ingredientId, tag: norm.tag }).onConflictDoNothing().run();
  return { ok: true };
}

/**
 * Drop a tag from an ingredient. Idempotent — removing a tag that wasn't
 * present is a no-op. We don't surface "not found" here; the UI tracks chip
 * state locally and the optimistic update doesn't need a server confirmation
 * for a delete that already matches reality.
 */
export function removeTagFromIngredient(
  db: FoodDb,
  ingredientId: number,
  tag: string
): { ok: true } {
  const trimmed = tag.trim().toLowerCase();
  if (trimmed.length === 0) return { ok: true };
  db.delete(ingredientTags)
    .where(and(eq(ingredientTags.ingredientId, ingredientId), eq(ingredientTags.tag, trimmed)))
    .run();
  return { ok: true };
}

export function listTagsForIngredient(db: FoodDb, ingredientId: number): { tags: string[] } {
  const rows = db
    .select({ tag: ingredientTags.tag })
    .from(ingredientTags)
    .where(eq(ingredientTags.ingredientId, ingredientId))
    .all();
  const tags = rows.map((r) => r.tag);
  tags.sort((a, b) => a.localeCompare(b));
  return { tags };
}

/**
 * Replace the full tag set on the ingredient in one transaction. The UI
 * chip editor uses this — the user adds/removes chips locally and commits
 * the resulting set with a single mutation.
 *
 * Empty `tags=[]` is allowed and clears every tag.
 */
export function setTagsForIngredient(
  db: FoodDb,
  ingredientId: number,
  tags: readonly string[]
): TagOpResult {
  const normalised: string[] = [];
  for (const raw of tags) {
    const norm = safeNormalise(raw);
    if (!norm.ok) return norm;
    normalised.push(norm.tag);
  }
  try {
    assertIngredientExists(db, ingredientId);
  } catch (err) {
    if (err instanceof IngredientNotFound) return { ok: false, reason: 'IngredientNotFound' };
    throw err;
  }
  const uniqueTags = Array.from(new Set(normalised));
  db.transaction((tx) => {
    tx.delete(ingredientTags).where(eq(ingredientTags.ingredientId, ingredientId)).run();
    if (uniqueTags.length > 0) {
      tx.insert(ingredientTags)
        .values(uniqueTags.map((tag) => ({ ingredientId, tag })))
        .run();
    }
  });
  return { ok: true };
}

/**
 * Look up every ingredient carrying a given tag. Returns a slim summary
 * (id + slug + name) so the Tags vocabulary tab can render the drill-down
 * without re-querying for each row.
 */
export function listIngredientsByTag(
  db: FoodDb,
  tag: string
): { ingredients: IngredientSummary[] } {
  const trimmed = tag.trim().toLowerCase();
  if (trimmed.length === 0) return { ingredients: [] };
  const rows = db
    .select({
      id: ingredients.id,
      slug: ingredients.slug,
      name: ingredients.name,
    })
    .from(ingredientTags)
    .innerJoin(ingredients, eq(ingredients.id, ingredientTags.ingredientId))
    .where(eq(ingredientTags.tag, trimmed))
    .all();
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { ingredients: rows };
}

/**
 * Distinct tag values with usage counts. Powers the autocomplete picker and
 * the Tags vocabulary tab.
 *
 * With `namespacePrefix='store-section'` the underlying expression index
 * (`idx_ingredient_tags_namespace`) makes the lookup an index range scan
 * rather than a full table scan. The shopping generator calls this every
 * generation.
 *
 * Results are sorted by usage descending so the most-used tags surface
 * first; ties break alphabetically.
 */
export function listDistinctTags(
  db: FoodDb,
  options: ListDistinctTagsOptions
): { tags: TagDistinctRow[] } {
  const limit = options.limit ?? 50;
  const countCol = count(ingredientTags.ingredientId);
  const firstSeenCol = min(ingredientTags.createdAt);
  // ORDER BY + LIMIT pushed into SQLite so the namespace expression index
  // can drive the lookup and the engine returns only the top-N to JS rather
  // than the full distinct set.
  const baseSelect = db
    .select({
      tag: ingredientTags.tag,
      ingredientCount: countCol,
      firstSeenAt: firstSeenCol,
    })
    .from(ingredientTags)
    .groupBy(ingredientTags.tag)
    .orderBy(desc(countCol), asc(ingredientTags.tag))
    .limit(limit);
  const rows =
    options.namespacePrefix === null
      ? baseSelect.all()
      : baseSelect.where(like(ingredientTags.tag, `${options.namespacePrefix}:%`)).all();
  return {
    tags: rows.map((r) => ({
      tag: r.tag,
      ingredientCount: Number(r.ingredientCount ?? 0),
      firstSeenAt: r.firstSeenAt ?? '',
    })),
  };
}

/**
 * Convenience helper for callers that just want the count of ingredients
 * with at least one tag in a namespace — used by the vocabulary tab's
 * empty-state copy. Cheap COUNT(DISTINCT) against the expression index.
 */
export function countIngredientsInNamespace(db: FoodDb, namespacePrefix: string): number {
  const rows = db
    .select({ count: sql<number>`count(distinct ${ingredientTags.ingredientId})` })
    .from(ingredientTags)
    .where(like(ingredientTags.tag, `${namespacePrefix}:%`))
    .all();
  return Number(rows[0]?.count ?? 0);
}
