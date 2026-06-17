/**
 * Wire types for the plan grid — derived from the generated food SDK
 * `plan.weekView` response so they stay in lockstep with the REST surface.
 */
import type { PlanWeekViewResponses } from '../../food-api/types.gen.js';

export type WirePlanEntryRow = PlanWeekViewResponses[200]['entries'][number];
export type WirePlanSlotRow = PlanWeekViewResponses[200]['slots'][number];
