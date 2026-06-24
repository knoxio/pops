/**
 * Type contracts for the planning page, shared between the
 * contract/router and the planning components so the wire shape has a
 * single source of truth.
 */

export interface PlanSlotRow {
  slug: string;
  name: string;
  displayOrder: number;
  isDefault: boolean;
}

export interface PlanEntryRow {
  id: number;
  date: string;
  slot: string;
  position: number;
  recipeId: number;
  recipeSlug: string;
  recipeTitle: string;
  recipeType: string | null;
  heroImagePath: string | null;
  plannedServings: number;
  recipeVersionId: number | null;
  recipeRunId: number | null;
  recipeRunCookedAt: string | null;
  notes: string | null;
}

export interface WeekView {
  weekStart: string;
  weekEnd: string;
  slots: readonly PlanSlotRow[];
  entries: readonly PlanEntryRow[];
}

export type PlanEntryError =
  | 'NotFound'
  | 'AlreadyCooked'
  | 'BadDate'
  | 'BadSlot'
  | 'RecipeArchived'
  | 'RecipeHasNoCurrentVersion';

export type PlanSlotError = 'SlugTaken' | 'SlugInvalid';

export type PlanSlotUpdateError = 'SlotNotFound' | 'CannotEditDefault';

export type PlanSlotDeleteError = 'SlotNotFound' | 'CannotDeleteDefault' | 'SlotInUse';

export type ReorderSlotError = 'BadIds' | 'EmptySlot';

export type PlanEntryMutationResult = { ok: true } | { ok: false; reason: PlanEntryError };

export type PlanSlotMutationResult = { ok: true } | { ok: false; reason: PlanSlotError };

export type PlanSlotUpdateResult = { ok: true } | { ok: false; reason: PlanSlotUpdateError };

export type PlanSlotDeleteResult = { ok: true } | { ok: false; reason: PlanSlotDeleteError };

export type ReorderSlotResult = { ok: true } | { ok: false; reason: ReorderSlotError };
