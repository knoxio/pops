/**
 * Local wire-shape mirrors for the cook modal — PRD-144.
 *
 * Mirrors `MarkCookedInputSchema` from the API package without pulling
 * `@pops/api` into this frontend package (cyclic dep — the api-client
 * re-exports the trpc procedures, but the request shape is the modal's
 * own concern). PRD-146 imports the same shape from this file when it
 * lands its real shortfall-resolution UX.
 */

import type { ConsumptionOverride } from './cook-resolution-types.js';

export interface MarkCookedInput {
  recipeVersionId: number;
  scaleFactor: number;
  planEntryId?: number;
  yield?: {
    qty: number;
    unit: 'g' | 'ml' | 'count';
    location: 'pantry' | 'fridge' | 'freezer' | 'other';
    expiresAt?: string;
    notes?: string;
  };
  rating?: number;
  notes?: string;
  consumptionOverrides?: ConsumptionOverride[];
}
