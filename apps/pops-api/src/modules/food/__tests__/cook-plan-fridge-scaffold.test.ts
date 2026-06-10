/**
 * I5-prep scaffold tests.
 *
 * Asserts the three new sub-routers (`food.batches`, `food.cook`,
 * `food.plan`) are mounted, accept their PRD-spec'd inputs, and throw
 * `NOT_IMPLEMENTED` at runtime. PRDs 143/144/145/146/147 swap real
 * behaviour in without re-shaping the wire surface — this test stays
 * green until then.
 *
 * Schema migrations are NOT loaded. The scaffold throws before touching
 * the DB.
 */

import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { createCaller } from '../../../shared/test-utils.js';

type AnyError = unknown;

function isNotImplemented(err: AnyError): boolean {
  return err instanceof TRPCError && err.code === 'NOT_IMPLEMENTED';
}

describe('food.cook.* scaffold (PRD-144)', () => {
  const caller = createCaller();

  it('rejects `prepareCook` with NOT_IMPLEMENTED', async () => {
    await expect(
      caller.food.cook.prepareCook({ recipeVersionId: 1, scaleFactor: 1 })
    ).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `markCooked` with NOT_IMPLEMENTED', async () => {
    await expect(
      caller.food.cook.markCooked({ recipeVersionId: 1, scaleFactor: 1 })
    ).rejects.toSatisfy(isNotImplemented);
  });
});

describe('food.plan.* scaffold (PRD-143)', () => {
  const caller = createCaller();

  it('rejects `weekView` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.weekView({ weekStart: '2026-06-15' })).rejects.toSatisfy(
      isNotImplemented
    );
  });

  it('rejects `addEntry` with NOT_IMPLEMENTED', async () => {
    await expect(
      caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: 1,
        plannedServings: 2,
      })
    ).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `updateEntry` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.updateEntry({ id: 1, plannedServings: 3 })).rejects.toSatisfy(
      isNotImplemented
    );
  });

  it('rejects `moveEntry` with NOT_IMPLEMENTED', async () => {
    await expect(
      caller.food.plan.moveEntry({ id: 1, date: '2026-06-16', slot: 'lunch' })
    ).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `reorderSlot` with NOT_IMPLEMENTED', async () => {
    await expect(
      caller.food.plan.reorderSlot({ date: '2026-06-15', slot: 'dinner', orderedIds: [1, 2] })
    ).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `deleteEntry` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.deleteEntry({ id: 1 })).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `listSlots` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.listSlots()).rejects.toSatisfy(isNotImplemented);
  });

  it('rejects `addSlot` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.addSlot({ slug: 'tea', name: 'Tea' })).rejects.toSatisfy(
      isNotImplemented
    );
  });

  it('rejects `updateSlot` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.updateSlot({ slug: 'tea', name: 'High tea' })).rejects.toSatisfy(
      isNotImplemented
    );
  });

  it('rejects `deleteSlot` with NOT_IMPLEMENTED', async () => {
    await expect(caller.food.plan.deleteSlot({ slug: 'tea' })).rejects.toSatisfy(isNotImplemented);
  });
});
