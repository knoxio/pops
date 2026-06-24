/**
 * Creation flows: `create`, `createNewDraft`, `restoreVersion`.
 *
 * Each delegates row inserts to the recipe + version services, then parses
 * the DSL header for slug + metadata and runs the compile pipeline against
 * the freshly-written draft so the editor's first response carries the
 * `CompileResult`.
 */
import { and, eq } from 'drizzle-orm';

import {
  recipes,
  recipesService,
  recipeVersions,
  recipeVersionsService,
  type FoodDb,
} from '../../../db/index.js';
import { type RecipeAst, type RecipeHeader } from '../../../dsl/ast.js';
import { compileRecipeVersion } from '../../../dsl/compile.js';
import { parseRecipeDsl } from '../../../dsl/parser.js';
import { HttpError } from '../../shared/errors.js';
import { mapCreateRecipeError } from './error-mapping.js';

import type {
  CreateNewDraftResult,
  CreateRecipeResult,
  RecipeType,
  RestoreVersionResult,
} from './types.js';

const { createRecipe } = recipesService;
const { createNewVersion } = recipeVersionsService;

function parseOrReject(dsl: string): { header: RecipeHeader; ast: RecipeAst } {
  const parsed = parseRecipeDsl(dsl);
  if (parsed.ok) {
    return { header: parsed.ast.recipe, ast: parsed.ast };
  }
  // The editor surfaces every parse error inline. On create we reject with
  // BAD_REQUEST so the toast can show a single message; saveDraft is the
  // path that returns the full per-error CompileResult.
  const first = parsed.errors[0];
  const message =
    first?.code === 'MissingRecipeHeader'
      ? 'DSL is missing an @recipe(slug=...) header'
      : (first?.message ?? 'DSL parse failed');
  throw new HttpError(400, message, first, 'common.validationFailed');
}

export function createNewRecipe(db: FoodDb, dsl: string): CreateRecipeResult {
  const { header } = parseOrReject(dsl);
  try {
    const result = createRecipe(db, {
      slug: header.slug,
      recipeType: header.recipeType as RecipeType | undefined,
      firstVersion: {
        title: header.title,
        bodyDsl: dsl,
        summary: header.summary ?? null,
        servings: header.servings ?? null,
        prepMinutes: minutesOf(header.prepTime?.qty, header.prepTime?.unit),
        cookMinutes: minutesOf(header.cookTime?.qty, header.cookTime?.unit),
      },
    });
    const compile = compileRecipeVersion(result.version.id, db);
    return {
      slug: result.recipe.slug,
      recipeId: result.recipe.id,
      versionId: result.version.id,
      compile,
    };
  } catch (err) {
    mapCreateRecipeError(err);
  }
}

export function createNewDraftForSlug(db: FoodDb, slug: string): CreateNewDraftResult {
  const recipeRow = db
    .select({
      id: recipes.id,
      currentVersionId: recipes.currentVersionId,
    })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .all()[0];
  if (recipeRow === undefined) {
    throw new HttpError(404, `Recipe "${slug}" not found`, undefined, 'common.notFound');
  }
  const existingDraft = db
    .select({ id: recipeVersions.id, versionNo: recipeVersions.versionNo })
    .from(recipeVersions)
    .where(and(eq(recipeVersions.recipeId, recipeRow.id), eq(recipeVersions.status, 'draft')))
    .all()[0];
  if (existingDraft !== undefined) {
    return { versionId: existingDraft.id, versionNo: existingDraft.versionNo };
  }
  const source = sourceVersionFor(db, recipeRow.currentVersionId, slug);
  const fresh = createNewVersion(db, {
    recipeId: recipeRow.id,
    title: source.title,
    bodyDsl: source.bodyDsl,
    summary: source.summary,
    servings: source.servings,
    prepMinutes: source.prepMinutes,
    cookMinutes: source.cookMinutes,
  });
  return { versionId: fresh.id, versionNo: fresh.versionNo };
}

interface SourceVersion {
  title: string;
  bodyDsl: string;
  summary: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
}

function sourceVersionFor(
  db: FoodDb,
  currentVersionId: number | null,
  slug: string
): SourceVersion {
  if (currentVersionId === null) {
    throw new HttpError(
      400,
      `Recipe "${slug}" has no current version to fork from. Open the existing draft instead.`,
      undefined,
      'common.validationFailed'
    );
  }
  const v = db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, currentVersionId))
    .all()[0];
  if (v === undefined) {
    // Integrity violation — surface as 500 via the Express error pipeline.
    throw new Error('recipe.current_version_id points at a missing row');
  }
  return {
    title: v.title,
    bodyDsl: v.bodyDsl,
    summary: v.summary,
    servings: v.servings,
    prepMinutes: v.prepMinutes,
    cookMinutes: v.cookMinutes,
  };
}

export function restoreVersionAsDraft(db: FoodDb, sourceVersionId: number): RestoreVersionResult {
  const source = db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, sourceVersionId))
    .all()[0];
  if (source === undefined) {
    throw new HttpError(404, 'Source version not found', undefined, 'common.notFound');
  }
  const fresh = createNewVersion(db, {
    recipeId: source.recipeId,
    title: source.title,
    bodyDsl: source.bodyDsl,
    summary: source.summary,
    servings: source.servings,
    prepMinutes: source.prepMinutes,
    cookMinutes: source.cookMinutes,
  });
  return { newVersionId: fresh.id, newVersionNo: fresh.versionNo };
}

const MINUTE_MULTIPLIERS: Record<string, number> = {
  s: 1 / 60,
  sec: 1 / 60,
  second: 1 / 60,
  seconds: 1 / 60,
  min: 1,
  minute: 1,
  minutes: 1,
  h: 60,
  hr: 60,
  hour: 60,
  hours: 60,
};

function minutesOf(qty: number | undefined, unit: string | undefined): number | null {
  if (qty === undefined || unit === undefined) return null;
  const factor = MINUTE_MULTIPLIERS[unit.toLowerCase()];
  if (factor === undefined) return null;
  return Math.max(0, Math.round(qty * factor));
}
