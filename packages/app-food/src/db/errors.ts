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
