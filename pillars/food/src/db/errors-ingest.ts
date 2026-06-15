/**
 * PRD-110 (ingest) + PRD-151 (tag) + PRD-123 (seeded-row) domain errors.
 *
 * Split from `errors.ts` to keep individual files under the max-lines lint
 * threshold. Re-exported from `errors.ts` so consumers don't need to
 * know about the split.
 */
import type { IngestSourceKind } from './schema.js';

// ── PRD-110 ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use `IngestSourceKind` from `./schema`. Kept as an alias so
 * existing imports inside the package keep compiling.
 */
export type IngestKind = IngestSourceKind;

export class IngestSourceUrlRequired extends Error {
  readonly kind: IngestSourceKind;

  constructor(kind: IngestSourceKind) {
    super(`ingest_sources.url is required for kind="${kind}"`);
    this.name = 'IngestSourceUrlRequired';
    this.kind = kind;
  }
}

export class IngestSourceNotFound extends Error {
  readonly sourceId: number;

  constructor(sourceId: number) {
    super(`ingest_sources row #${sourceId} not found`);
    this.name = 'IngestSourceNotFound';
    this.sourceId = sourceId;
  }
}

// ── PRD-151 ─────────────────────────────────────────────────────────────

/**
 * Thrown by the ingredient-tags service when a tag fails normalisation —
 * either the value collapsed to an empty string after trimming, or the
 * remaining characters violate the canonical regex documented in PRD-151.
 *
 * Allowed shape: `^[a-z0-9_-]+(:[a-z0-9_-]+)*$` (one or more segments joined
 * by `:`). Service-layer trims and lowercases before validating.
 */
export class BadTagFormat extends Error {
  readonly tag: string;

  constructor(tag: string) {
    super(`Tag "${tag}" is not a valid format — expected ^[a-z0-9_-]+(:[a-z0-9_-]+)*$`);
    this.name = 'BadTagFormat';
    this.tag = tag;
  }
}

/**
 * Thrown when a tag exceeds 64 characters after normalisation. Service-layer
 * cap rather than a CHECK constraint so the error message can carry the value.
 */
export class TagTooLong extends Error {
  readonly tag: string;
  readonly length: number;

  constructor(tag: string, length: number) {
    super(`Tag "${tag}" is ${length} characters long; max is 64.`);
    this.name = 'TagTooLong';
    this.tag = tag;
    this.length = length;
  }
}

export class IngredientNotFound extends Error {
  readonly ingredientId: number;

  constructor(ingredientId: number) {
    super(`Ingredient #${ingredientId} not found`);
    this.name = 'IngredientNotFound';
    this.ingredientId = ingredientId;
  }
}

// ── PRD-123 ─────────────────────────────────────────────────────────────

/**
 * Thrown when a service-layer delete targets a row flagged `is_seeded=1`.
 * Seeded rows are owned by PRD-113's seed task; deletion is disabled in the
 * admin UI and refused server-side so re-seeding stays the single source of
 * truth.
 */
export class SeededRowProtected extends Error {
  readonly table: 'unit_conversions' | 'ingredient_weights';
  readonly id: number;

  constructor(table: 'unit_conversions' | 'ingredient_weights', id: number) {
    super(`Row #${id} in ${table} is seeded and cannot be deleted (re-seed to restore).`);
    this.name = 'SeededRowProtected';
    this.table = table;
    this.id = id;
  }
}
