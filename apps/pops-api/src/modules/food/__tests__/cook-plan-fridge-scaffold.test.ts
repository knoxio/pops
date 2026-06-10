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

// PRD-145 wired create/get/relocate/edit/adjustQty/delete and PRD-146
// wired `searchForConsume` — see `batches-router.test.ts` for the
// behaviour suite. No `food.batches.*` procedures remain in scaffold.
//
// PRD-144 wired food.cook.prepareCook + food.cook.markCooked — see
// `cook-router.test.ts` for the behaviour suite. No procedures remain
// in the cook scaffold's NOT_IMPLEMENTED allowlist.

// PRD-143 wired `food.plan.*` — integration coverage moved to
// `plan-router.test.ts`.
