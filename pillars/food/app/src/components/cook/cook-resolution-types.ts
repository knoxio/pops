/**
 * Cook-flow view + resolution types.
 *
 * Wire-shaped values (`CookPreparation`, `CookYieldDefault`,
 * `LineConsumeNeed`, `BatchForConsumeRow`, `ConsumptionOverride`) are
 * projected from the generated food SDK so the modal stays in lockstep
 * with the `/cook/*` + `/batches/*` REST surface. `LineResolution` and
 * `LineShortfall` are FE-only modal state — they never cross the wire,
 * so they live here.
 */
import type {
  BatchesSearchForConsumeResponses,
  CookMarkCookedData,
  CookPrepareCookResponses,
} from '../../food-api/types.gen.js';

export type CookPreparation = CookPrepareCookResponses[200];
export type CookYieldDefault = NonNullable<CookPreparation['yieldDefault']>;
export type LineConsumeNeed = CookPreparation['consumeNeeds'][number];

export type BatchForConsumeRow = BatchesSearchForConsumeResponses[200]['items'][number];

export type ConsumptionOverride = NonNullable<
  NonNullable<CookMarkCookedData['body']>['consumptionOverrides']
>[number];

/**
 * Per-line resolution state held by `useCookResolution`.
 *
 * `fifo` = accept the default FIFO consumption; `batch-override` = user
 * picked a specific batch; `external` = user marks the line as consumed
 * outside the batch system; `partial` = some FIFO + some external.
 */
export type LineResolution =
  | { kind: 'fifo' }
  | { kind: 'batch-override'; batchId: number; consumeQty: number; substitutionEdgeId?: number }
  | { kind: 'external'; reasonNote?: string }
  | {
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      substitutionEdgeId?: number;
    };

/**
 * Per-line shortfall the cook modal surfaces when FIFO can't fully cover
 * a line. `lineIndex` matches `recipe_lines.position` (1-based).
 */
export interface LineShortfall {
  lineIndex: number;
  ingredientName: string;
  variantName: string;
  needed: number;
  available: number;
  unit: 'g' | 'ml' | 'count';
}
