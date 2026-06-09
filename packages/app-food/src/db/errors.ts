/**
 * Typed errors raised by the food schema service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The pops-api router maps them to the appropriate status codes when
 * surfacing to clients.
 */

export type SlugKind = 'ingredient' | 'recipe' | 'prep_state';

export class InvalidSlugError extends Error {
  readonly slug: string;
  readonly reason: string;

  constructor(slug: string, reason: string) {
    super(`Invalid slug "${slug}": ${reason}`);
    this.name = 'InvalidSlugError';
    this.slug = slug;
    this.reason = reason;
  }
}

export class SlugAlreadyRegisteredError extends Error {
  readonly slug: string;
  readonly kind: SlugKind;

  constructor(slug: string, kind: SlugKind) {
    super(`Slug "${slug}" is already registered as kind="${kind}"`);
    this.name = 'SlugAlreadyRegisteredError';
    this.slug = slug;
    this.kind = kind;
  }
}

export class IngredientCycleError extends Error {
  readonly ingredientId: number;
  readonly proposedParentId: number;

  constructor(ingredientId: number, proposedParentId: number) {
    super(
      `Setting parent_id=${proposedParentId} on ingredient #${ingredientId} would form a cycle`
    );
    this.name = 'IngredientCycleError';
    this.ingredientId = ingredientId;
    this.proposedParentId = proposedParentId;
  }
}

// ── PRD-107 errors ──────────────────────────────────────────────────────

export class CannotPromoteUncompiledVersion extends Error {
  readonly versionId: number;
  readonly compileStatus: 'uncompiled' | 'failed';

  constructor(versionId: number, compileStatus: 'uncompiled' | 'failed') {
    super(
      `Cannot promote recipe_version #${versionId} — compile_status="${compileStatus}". Fix the DSL and recompile first.`
    );
    this.name = 'CannotPromoteUncompiledVersion';
    this.versionId = versionId;
    this.compileStatus = compileStatus;
  }
}

export class CannotEditPublishedVersion extends Error {
  readonly versionId: number;

  constructor(versionId: number) {
    super(
      `Cannot edit recipe_version #${versionId} — its status is "current" or "archived". Create a new draft version instead.`
    );
    this.name = 'CannotEditPublishedVersion';
    this.versionId = versionId;
  }
}

export class ConcurrentPromotion extends Error {
  readonly recipeId: number;

  constructor(recipeId: number) {
    super(`Concurrent promotion on recipe #${recipeId} — another version was promoted first.`);
    this.name = 'ConcurrentPromotion';
    this.recipeId = recipeId;
  }
}

// ── PRD-108 errors ──────────────────────────────────────────────────────

export class CannotCookUncompiledRecipe extends Error {
  readonly recipeVersionId: number;
  readonly compileStatus: 'uncompiled' | 'failed';

  constructor(recipeVersionId: number, compileStatus: 'uncompiled' | 'failed') {
    super(
      `Cannot cook recipe_version #${recipeVersionId} — compile_status="${compileStatus}". Recompile before cooking.`
    );
    this.name = 'CannotCookUncompiledRecipe';
    this.recipeVersionId = recipeVersionId;
    this.compileStatus = compileStatus;
  }
}

export class IngredientHierarchyDepthExceeded extends Error {
  readonly parentId: number;
  readonly depth: number;

  constructor(parentId: number, depth: number) {
    super(`Depth ${depth} exceeds the max of 3 (parent chain rooted at ingredient #${parentId})`);
    this.name = 'IngredientHierarchyDepthExceeded';
    this.parentId = parentId;
    this.depth = depth;
  }
}
