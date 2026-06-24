/**
 * Handlers for the `plan.*` sub-router. Mutations return the discriminated
 * `{ ok, ... }` result on 200; `weekView` maps a bad ISO date to 400.
 * Guard/validation logic lives in `modules/plan/` helpers; the slot mutations
 * live in `modules/plan/slot-mutations.ts`.
 */
import { and, eq } from 'drizzle-orm';

import {
  type FoodDb,
  planEntries,
  planService,
  PlanEntryHasCookEvent,
  PlanEntryNotFound,
} from '../../db/index.js';
import { BadIsoDateError, isValidIsoDate } from '../modules/plan/iso-week.js';
import {
  nextPositionForSlot,
  planEntryById,
  planEntryFail,
  recipeGuard,
  slotExists,
} from '../modules/plan/router-helpers.js';
import {
  addSlotResult,
  deleteSlotResult,
  updateSlotResult,
} from '../modules/plan/slot-mutations.js';
import { buildWeekView, listWireSlots } from '../modules/plan/week-view.js';
import { HttpError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodPlanContract } from '../../contract/rest-plan.js';

type Req = ServerInferRequest<typeof foodPlanContract>;

function ok<T>(body: T): { status: 200; body: T } {
  return { status: 200, body };
}

function applyEntryPatch(
  db: FoodDb,
  id: number,
  patch: { plannedServings?: number; recipeVersionId?: number | null; notes?: string | null }
): void {
  const updates: Record<string, unknown> = {};
  if (patch.plannedServings !== undefined) updates['plannedServings'] = patch.plannedServings;
  if (patch.recipeVersionId !== undefined) updates['recipeVersionId'] = patch.recipeVersionId;
  if (patch.notes !== undefined) updates['notes'] = patch.notes;
  if (Object.keys(updates).length === 0) return;
  db.update(planEntries).set(updates).where(eq(planEntries.id, id)).run();
}

export function makePlanHandlers(db: FoodDb) {
  return {
    weekView: ({ query }: Req['weekView']) =>
      runHttp(() => {
        try {
          return ok(buildWeekView(db, query.weekStart));
        } catch (err) {
          if (err instanceof BadIsoDateError) {
            throw new HttpError(400, err.message, undefined, 'common.validationFailed');
          }
          throw err;
        }
      }),

    listSlots: () => runHttp(() => ok({ slots: listWireSlots(db) })),

    addSlot: ({ body }: Req['addSlot']) =>
      runHttp(() => ok(addSlotResult(db, body.slug, body.name))),

    updateSlot: ({ params, body }: Req['updateSlot']) =>
      runHttp(() => ok(updateSlotResult(db, params.slug, body))),

    deleteSlot: ({ params }: Req['deleteSlot']) =>
      runHttp(() => ok(deleteSlotResult(db, params.slug))),

    addEntry: ({ body }: Req['addEntry']) =>
      runHttp(() => {
        if (!isValidIsoDate(body.date)) return ok(planEntryFail('BadDate'));
        if (!slotExists(db, body.slot)) return ok(planEntryFail('BadSlot'));
        const guard = recipeGuard(db, body.recipeId, body.recipeVersionId ?? null);
        if (guard !== null) return ok(guard);
        const row = db.transaction(() =>
          planService.addPlanEntry(db, {
            date: body.date,
            slot: body.slot,
            recipeId: body.recipeId,
            recipeVersionId: body.recipeVersionId ?? null,
            plannedServings: body.plannedServings,
            notes: body.notes ?? null,
          })
        );
        return ok({ ok: true as const, id: row.id, position: row.position });
      }),

    updateEntry: ({ params, body }: Req['updateEntry']) =>
      runHttp(() =>
        db.transaction(() => {
          const existing = planEntryById(db, params.id);
          if (existing === null) return ok(planEntryFail('NotFound'));
          if (existing.recipeRunId !== null) return ok(planEntryFail('AlreadyCooked'));
          if (body.recipeVersionId !== undefined) {
            const guard = recipeGuard(db, existing.recipeId, body.recipeVersionId);
            if (guard !== null) return ok(guard);
          }
          applyEntryPatch(db, params.id, body);
          return ok({ ok: true as const });
        })
      ),

    moveEntry: ({ params, body }: Req['moveEntry']) =>
      runHttp(() => {
        if (!isValidIsoDate(body.date)) return ok(planEntryFail('BadDate'));
        return db.transaction(() => {
          const existing = planEntryById(db, params.id);
          if (existing === null) return ok(planEntryFail('NotFound'));
          if (existing.recipeRunId !== null) return ok(planEntryFail('AlreadyCooked'));
          if (!slotExists(db, body.slot)) return ok(planEntryFail('BadSlot'));
          const position = body.position ?? nextPositionForSlot(db, body.date, body.slot);
          db.update(planEntries)
            .set({ date: body.date, slot: body.slot, position })
            .where(eq(planEntries.id, params.id))
            .run();
          return ok({ ok: true as const });
        });
      }),

    deleteEntry: ({ params }: Req['deleteEntry']) =>
      runHttp(() => {
        try {
          planService.removePlanEntry(db, params.id);
          return ok({ ok: true as const });
        } catch (err) {
          if (err instanceof PlanEntryNotFound) return ok(planEntryFail('NotFound'));
          if (err instanceof PlanEntryHasCookEvent) return ok(planEntryFail('AlreadyCooked'));
          throw err;
        }
      }),

    reorderSlot: ({ body }: Req['reorderSlot']) =>
      runHttp(() =>
        db.transaction(() => {
          const cellRows = db
            .select({ id: planEntries.id })
            .from(planEntries)
            .where(and(eq(planEntries.date, body.date), eq(planEntries.slot, body.slot)))
            .all();
          const cellIds = new Set(cellRows.map((r) => r.id));
          const allBelong = body.orderedIds.every((id) => cellIds.has(id));
          const uniqueIds = new Set(body.orderedIds);
          if (!allBelong || uniqueIds.size !== body.orderedIds.length) {
            return ok({ ok: false as const, reason: 'BadIds' as const });
          }
          planService.reorderSlot(db, body.orderedIds);
          return ok({ ok: true as const });
        })
      ),
  };
}
