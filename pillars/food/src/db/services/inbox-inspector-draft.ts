/**
 * PRD-135 — draft-side reads for the inspector.
 *
 * Composes the inspector's `InspectorDraftView` from the most-recent
 * `recipe_versions` row linked to the source (per PRD-135 §Route). Joins
 * the parent recipe for slug + archived-at and folds in proposed slugs,
 * the rejection row, the auto-create banner data (PRD-115 / PRD-116
 * creations enriched with parent slug + default unit), and the PRD-137
 * quality breakdown via `gatherQualityInputsForVersions + scoreDraft`.
 */
import { desc, eq, inArray } from 'drizzle-orm';

import { gatherQualityInputsForVersions } from '../../inbox/gather-quality-inputs.js';
import { scoreDraft } from '../../inbox/quality.js';
import {
  ingredients,
  ingredientVariants,
  recipes,
  recipeVersionProposedSlugs,
  recipeVersionRejections,
  recipeVersions,
} from '../schema.js';
import { listCreationsForVersion } from './creations.js';
import { parseCompileErrorJson, safeParseSourceSpan } from './inbox-inspector-parsers.js';
import { type FoodDb } from './internal.js';

import type {
  InspectorDraftView,
  InspectorProposedSlugRow,
  InspectorResolverCreationRow,
} from './inbox-inspector-types.js';

interface DraftVersionRow {
  versionId: number;
  versionNo: number;
  recipeSlug: string;
  recipeArchivedAt: string | null;
  status: 'draft' | 'current' | 'archived';
  title: string;
  bodyDsl: string;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
  compileError: string | null;
  compiledAt: string | null;
}

export function buildDraftView(db: FoodDb, sourceId: number): InspectorDraftView | null {
  const versionRow = readDraftVersionRow(db, sourceId);
  if (versionRow === null) return null;
  const proposedSlugs = readProposedSlugs(db, versionRow.versionId);
  const creations = readEnrichedCreations(db, versionRow.versionId);
  const rejection = readRejection(db, versionRow.versionId);
  const quality = computeQuality(db, versionRow.versionId);
  return {
    versionId: versionRow.versionId,
    versionNo: versionRow.versionNo,
    recipeSlug: versionRow.recipeSlug,
    recipeArchivedAt: versionRow.recipeArchivedAt,
    status: versionRow.status,
    title: versionRow.title.trim().length === 0 ? null : versionRow.title,
    bodyDsl: versionRow.bodyDsl,
    compileStatus: versionRow.compileStatus,
    compileError: parseCompileErrorJson(versionRow.compileError, proposedSlugs.length),
    compiledAt: versionRow.compiledAt,
    rejection,
    proposedSlugs,
    creations,
    quality,
  };
}

function readDraftVersionRow(db: FoodDb, sourceId: number): DraftVersionRow | null {
  // PRD-135 §Route: "the draft version is the most-recent `recipe_versions`
  // row for that recipe with `source_id = :sourceId`". A retry that
  // overwrites the prior draft surfaces with the new versionNo automatically.
  const rows = db
    .select({
      versionId: recipeVersions.id,
      versionNo: recipeVersions.versionNo,
      recipeSlug: recipes.slug,
      recipeArchivedAt: recipes.archivedAt,
      status: recipeVersions.status,
      title: recipeVersions.title,
      bodyDsl: recipeVersions.bodyDsl,
      compileStatus: recipeVersions.compileStatus,
      compileError: recipeVersions.compileError,
      compiledAt: recipeVersions.compiledAt,
    })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(eq(recipeVersions.sourceId, sourceId))
    .orderBy(desc(recipeVersions.versionNo), desc(recipeVersions.id))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

function readProposedSlugs(db: FoodDb, versionId: number): InspectorProposedSlugRow[] {
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
  // Match the rest of the inspector service: malformed JSON returns a safe
  // fallback span rather than throwing and tanking the whole read (Copilot
  // R1). Mirrors the resilience pattern in `parseExtractedMeta` /
  // `parseCompileErrorJson`.
  return rows.map((r) => ({
    slug: r.slug,
    suggestedKind: r.suggestedKind,
    fromLoc: safeParseSourceSpan(r.fromLocJson),
    createdAt: r.createdAt,
  }));
}

function readRejection(db: FoodDb, versionId: number): InspectorDraftView['rejection'] {
  const rows = db
    .select({
      reason: recipeVersionRejections.reason,
      note: recipeVersionRejections.note,
      rejectedAt: recipeVersionRejections.rejectedAt,
    })
    .from(recipeVersionRejections)
    .where(eq(recipeVersionRejections.versionId, versionId))
    .all();
  const row = rows[0];
  if (row === undefined) return null;
  return { reason: row.reason, note: row.note, rejectedAt: row.rejectedAt };
}

function computeQuality(db: FoodDb, versionId: number): InspectorDraftView['quality'] {
  const inputs = gatherQualityInputsForVersions(db, [versionId]);
  const versionInputs = inputs.get(versionId);
  if (versionInputs === undefined) {
    // Defensive — the gather helper always returns inputs for known rows.
    // This branch reads as "score against the worst-case rubric" so the UI
    // surfaces a `blocked` band rather than crashing.
    return scoreDraft({
      ingestKind: 'url-web',
      ingestState: 'processing',
      ingestAgeMinutes: 0,
      compileStatus: 'uncompiled',
      compileErrorCount: 0,
      proposedSlugCount: 0,
      creationCount: 0,
      ingredientLineCount: 0,
      stepCount: 0,
      hasTitle: false,
      hasYield: false,
    });
  }
  return scoreDraft(versionInputs);
}

function readEnrichedCreations(db: FoodDb, versionId: number): InspectorResolverCreationRow[] {
  // PRD-135 §Data — only ingredient + variant rows feed the auto-create
  // banner. `kind='recipe'` rows are filtered out (the user reviews them
  // via the recipe nav, not the banner).
  const raw = listCreationsForVersion(db, versionId).filter(
    (r) => r.kind === 'ingredient' || r.kind === 'variant'
  );
  if (raw.length === 0) return [];

  const ingredientSlugs = raw.filter((r) => r.kind === 'ingredient').map((r) => r.slug);
  const variantSlugs = raw.filter((r) => r.kind === 'variant').map((r) => r.slug);

  const ingredientLookups =
    ingredientSlugs.length === 0 ? new Map() : readIngredientLookups(db, ingredientSlugs);
  const variantLookups =
    variantSlugs.length === 0 ? new Map() : readVariantLookups(db, variantSlugs);

  return raw.flatMap((r): InspectorResolverCreationRow[] => {
    if (r.kind === 'ingredient') {
      const lookup = ingredientLookups.get(r.slug);
      if (lookup === undefined) return [];
      return [
        {
          kind: 'ingredient',
          slug: r.slug,
          parentIngredientSlug: null,
          defaultUnit: lookup.defaultUnit,
          createdAt: r.createdAt,
        },
      ];
    }
    const lookup = variantLookups.get(r.slug);
    if (lookup === undefined) return [];
    return [
      {
        kind: 'variant',
        slug: r.slug,
        parentIngredientSlug: lookup.parentSlug,
        defaultUnit: lookup.defaultUnit,
        createdAt: r.createdAt,
      },
    ];
  });
}

function readIngredientLookups(
  db: FoodDb,
  slugs: string[]
): Map<string, { defaultUnit: 'g' | 'ml' | 'count' }> {
  const rows = db
    .select({ slug: ingredients.slug, defaultUnit: ingredients.defaultUnit })
    .from(ingredients)
    .where(inArray(ingredients.slug, slugs))
    .all();
  return new Map(rows.map((r) => [r.slug, { defaultUnit: r.defaultUnit }]));
}

function readVariantLookups(
  db: FoodDb,
  slugs: string[]
): Map<string, { parentSlug: string; defaultUnit: 'g' | 'ml' | 'count' }> {
  const rows = db
    .select({
      slug: ingredientVariants.slug,
      defaultUnit: ingredientVariants.defaultUnit,
      parentSlug: ingredients.slug,
    })
    .from(ingredientVariants)
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .where(inArray(ingredientVariants.slug, slugs))
    .all();
  return new Map(
    rows.map((r) => [r.slug, { parentSlug: r.parentSlug, defaultUnit: r.defaultUnit }])
  );
}
