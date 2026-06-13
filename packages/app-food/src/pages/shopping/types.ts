import type { inferRouterOutputs } from '@trpc/server';

/**
 * Wire types for the shopping FromPlanPage — derived from the server's
 * inferred router outputs so they always stay in lockstep with the
 * `food.shopping.*` procedures (PRD-152).
 */
import type { AppRouter } from '@pops/api';

type ShoppingOutputs = inferRouterOutputs<AppRouter>['food']['shopping'];

export type GeneratorPreview = ShoppingOutputs['previewFromPlan'];
export type GeneratorSection = GeneratorPreview['sections'][number];
export type GeneratorItem = GeneratorSection['items'][number];
export type GenerateFromPlanResult = ShoppingOutputs['generateFromPlan'];
