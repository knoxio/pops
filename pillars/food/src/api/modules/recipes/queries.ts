/**
 * Read helpers for the recipe list.
 *
 * Cursor-based pagination, filter chips (search / type / tag / archived
 * / draft-only), sort dropdown (createdAtDesc / titleAsc; the
 * `recentlyCooked` mode falls back to createdAtDesc — there is no
 * `recipe_runs.completed_at` data to join on yet). Tags + drafts +
 * proposed-slug helpers live in sibling files to honour the per-file
 * line cap.
 */
import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { recipes, recipeTags, recipeVersions, type FoodDb } from '../../../db/index.js';

import type { RecipeListItem, RecipeType, SortOrder } from './types.js';

export { listDraftsForSlug, listProposedSlugs } from './queries-drafts.js';

export interface ListRecipesFilter {
  search?: string;
  recipeTypes?: RecipeType[];
  tags?: string[];
  includeArchived: boolean;
  includeDraftOnly: boolean;
  sort: SortOrder;
  cursor?: { id: number; sortKey: string } | null;
  limit: number;
}

export interface ListRecipesResult {
  items: RecipeListItem[];
  nextCursor: string | null;
}

function encodeCursor(id: number, sortKey: string): string {
  return Buffer.from(`${sortKey}${CURSOR_SEP}${id}`, 'utf8').toString('base64url');
}

const CURSOR_SEP = '|';

export function decodeCursor(cursor: string): { id: number; sortKey: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(CURSOR_SEP);
    if (sep === -1) return null;
    const id = Number(decoded.slice(sep + 1));
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id, sortKey: decoded.slice(0, sep) };
  } catch {
    return null;
  }
}

interface JoinedRecipeRow {
  id: number;
  slug: string;
  recipeType: string;
  heroImagePath: string | null;
  archivedAt: string | null;
  createdAt: string;
  currentVersionId: number | null;
  title: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
}

export function listRecipes(db: FoodDb, filter: ListRecipesFilter): ListRecipesResult {
  const rows = selectRecipeRows(db, filter);
  const trimmed = rows.slice(0, filter.limit);
  const items = trimmed.map(
    (r): RecipeListItem => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      recipeType: r.recipeType as RecipeType,
      heroImagePath: r.heroImagePath,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      servings: r.servings,
      tags: [],
      hasCurrentVersion: r.currentVersionId !== null,
      archivedAt: r.archivedAt,
      createdAt: r.createdAt,
    })
  );
  hydrateTags(
    db,
    items,
    trimmed.map((r) => r.id)
  );
  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    rows.length > filter.limit && last !== undefined
      ? encodeCursor(last.id, sortKeyFor(filter.sort, last))
      : null;
  return { items, nextCursor };
}

function selectRecipeRows(db: FoodDb, filter: ListRecipesFilter): JoinedRecipeRow[] {
  const where = buildWhere(filter);
  const order = buildOrder(filter.sort);
  return db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      recipeType: recipes.recipeType,
      heroImagePath: recipes.heroImagePath,
      archivedAt: recipes.archivedAt,
      createdAt: recipes.createdAt,
      currentVersionId: recipes.currentVersionId,
      title: recipeVersions.title,
      prepMinutes: recipeVersions.prepMinutes,
      cookMinutes: recipeVersions.cookMinutes,
      servings: recipeVersions.servings,
    })
    .from(recipes)
    .leftJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
    .where(where)
    .orderBy(...order)
    .limit(filter.limit + 1)
    .all();
}

function buildWhere(filter: ListRecipesFilter): ReturnType<typeof and> {
  const clauses = [
    ...visibilityClauses(filter),
    ...searchClauses(filter),
    ...filterClauses(filter),
  ];
  if (filter.cursor) {
    const cursorWhere = cursorClause(filter, filter.cursor);
    if (cursorWhere !== undefined) clauses.push(cursorWhere);
  }
  return clauses.length === 0 ? undefined : and(...clauses);
}

function visibilityClauses(filter: ListRecipesFilter): SQL[] {
  const clauses: SQL[] = [];
  if (!filter.includeArchived) clauses.push(sql`${recipes.archivedAt} IS NULL`);
  if (!filter.includeDraftOnly) clauses.push(sql`${recipes.currentVersionId} IS NOT NULL`);
  return clauses;
}

function searchClauses(filter: ListRecipesFilter): SQL[] {
  if (!filter.search || filter.search.length === 0) return [];
  const pattern = `%${filter.search.toLowerCase()}%`;
  const clause = or(
    sql`lower(${recipeVersions.title}) LIKE ${pattern}`,
    sql`lower(${recipes.slug}) LIKE ${pattern}`
  );
  return clause === undefined ? [] : [clause];
}

function filterClauses(filter: ListRecipesFilter): SQL[] {
  const clauses: SQL[] = [];
  if (filter.recipeTypes && filter.recipeTypes.length > 0) {
    clauses.push(inArray(recipes.recipeType, filter.recipeTypes));
  }
  if (filter.tags && filter.tags.length > 0) {
    clauses.push(
      sql`EXISTS (SELECT 1 FROM ${recipeTags} WHERE ${recipeTags.recipeId} = ${recipes.id} AND ${recipeTags.tag} IN ${filter.tags})`
    );
  }
  return clauses;
}

function cursorClause(
  filter: ListRecipesFilter,
  cursor: { id: number; sortKey: string }
): ReturnType<typeof or> {
  if (filter.sort === 'titleAsc') {
    const lowerExpr = sql`lower(coalesce(${recipeVersions.title}, ${recipes.slug}))`;
    return or(
      gt(lowerExpr, cursor.sortKey),
      and(eq(lowerExpr, cursor.sortKey), gt(recipes.id, cursor.id))
    );
  }
  return or(
    lt(recipes.createdAt, cursor.sortKey),
    and(eq(recipes.createdAt, cursor.sortKey), lt(recipes.id, cursor.id))
  );
}

function buildOrder(sort: SortOrder): ReturnType<typeof asc>[] {
  if (sort === 'titleAsc') {
    return [asc(sql`lower(coalesce(${recipeVersions.title}, ${recipes.slug}))`), asc(recipes.id)];
  }
  return [desc(recipes.createdAt), desc(recipes.id)];
}

function sortKeyFor(sort: SortOrder, row: JoinedRecipeRow): string {
  if (sort === 'titleAsc') return (row.title ?? row.slug).toLowerCase();
  return row.createdAt;
}

function hydrateTags(db: FoodDb, items: RecipeListItem[], ids: number[]): void {
  if (ids.length === 0) return;
  const tags = db
    .select({ recipeId: recipeTags.recipeId, tag: recipeTags.tag })
    .from(recipeTags)
    .where(inArray(recipeTags.recipeId, ids))
    .all();
  const slugById = new Map<number, string>();
  items.forEach((item, idx) => {
    const id = ids[idx];
    if (id !== undefined) slugById.set(id, item.slug);
  });
  const bySlug = new Map<string, string[]>();
  for (const t of tags) {
    const slug = slugById.get(t.recipeId);
    if (slug === undefined) continue;
    const bucket = bySlug.get(slug) ?? [];
    bucket.push(t.tag);
    bySlug.set(slug, bucket);
  }
  for (const item of items) {
    item.tags = (bySlug.get(item.slug) ?? []).toSorted();
  }
}
