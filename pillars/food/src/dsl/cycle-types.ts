import type { FoodDb } from '../db/services/internal.js';
/**
 * Recipe-graph cycle detection types — PRD-117.
 *
 * The detector runs between PRD-115 (resolver) and PRD-116 (compile +
 * materialise). It walks the live recipe graph from a candidate recipe's
 * recipe-as-ingredient targets; a path back to the candidate itself is a
 * cycle.
 */
import type { SourceSpan } from './ast.js';

export interface CycleContext {
  /** Read-only Drizzle handle. Detector never writes. */
  db: FoodDb;
  /**
   * null for a brand-new recipe that has never been inserted (no incoming
   * edges possible). Otherwise the id of the recipe being compiled.
   */
  currentRecipeId: number | null;
}

export interface CycleDescription {
  /** Recipe ids in walk order. Starts and ends with `currentRecipeId`. */
  path: number[];
  /** Same path expressed as slugs — for editor messages. */
  pathSlugs: string[];
  /** The `@ingredient` block in the candidate that introduced the cycle. */
  offendingBlockLoc: SourceSpan;
}

export type CycleResult = { ok: true } | { ok: false; cycle: CycleDescription };

export interface CycleError {
  code: 'RecipeCycle';
  message: string;
  loc: SourceSpan;
}
