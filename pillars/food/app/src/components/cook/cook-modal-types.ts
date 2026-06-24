/**
 * Local mirror of the `markCooked` request body for the cook modal.
 *
 * Kept hand-maintained here rather than derived from the generated food
 * SDK types so the modal owns the shape it builds before it hits the
 * wire.
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
