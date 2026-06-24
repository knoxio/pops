/**
 * Read helpers for the drafts list + proposed-slug list.
 *
 * Split out of `queries.ts` to keep each file under the per-file 200-line
 * lint cap.
 */
import { and, desc, eq } from 'drizzle-orm';

import {
  recipes,
  recipeVersionProposedSlugs,
  recipeVersions,
  type FoodDb,
} from '../../../db/index.js';

import type { ProposedSlugRow, RecipeDraftSummary } from './types.js';

export function listDraftsForSlug(db: FoodDb, slug: string): RecipeDraftSummary[] | null {
  const recipeRow = db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .all()[0];
  if (recipeRow === undefined) return null;
  const rows = db
    .select({
      id: recipeVersions.id,
      versionNo: recipeVersions.versionNo,
      title: recipeVersions.title,
      compileStatus: recipeVersions.compileStatus,
      createdAt: recipeVersions.createdAt,
      bodyDsl: recipeVersions.bodyDsl,
    })
    .from(recipeVersions)
    .where(and(eq(recipeVersions.recipeId, recipeRow.id), eq(recipeVersions.status, 'draft')))
    .orderBy(desc(recipeVersions.versionNo))
    .all();
  return rows.map((r) => ({
    versionId: r.id,
    versionNo: r.versionNo,
    title: r.title,
    compileStatus: r.compileStatus,
    createdAt: r.createdAt,
    preview: previewFromDsl(r.bodyDsl),
  }));
}

function previewFromDsl(dsl: string): string {
  const collapsed = dsl.replace(/\s+/g, ' ').trim();
  return collapsed.length <= 80 ? collapsed : `${collapsed.slice(0, 77)}...`;
}

export function listProposedSlugs(db: FoodDb, versionId: number): ProposedSlugRow[] {
  const rows = db
    .select({
      slug: recipeVersionProposedSlugs.slug,
      suggestedKind: recipeVersionProposedSlugs.suggestedKind,
      fromLocJson: recipeVersionProposedSlugs.fromLocJson,
      createdAt: recipeVersionProposedSlugs.createdAt,
    })
    .from(recipeVersionProposedSlugs)
    .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
    .all();
  return rows.map((r) => ({
    slug: r.slug,
    suggestedKind: r.suggestedKind,
    // Column stores `SourceSpan` as JSON; the client treats it as the
    // inline-diagnostic location for the editor's `issues` prop.
    fromLoc: JSON.parse(r.fromLocJson) as ProposedSlugRow['fromLoc'],
    createdAt: r.createdAt,
  }));
}
