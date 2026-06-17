/**
 * Wire types for the shopping FromPlanPage — derived from the generated
 * food SDK so they stay in lockstep with the `/shopping/*` REST surface
 * (PRD-152).
 */
import type {
  ShoppingGenerateResponses,
  ShoppingPreviewResponses,
} from '../../food-api/types.gen.js';

export type GeneratorPreview = ShoppingPreviewResponses[200];
export type GeneratorSection = GeneratorPreview['sections'][number];
export type GeneratorItem = GeneratorSection['items'][number];
export type GenerateFromPlanResult = ShoppingGenerateResponses[200];
