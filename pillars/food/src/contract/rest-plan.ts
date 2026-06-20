/**
 * `plan.*` sub-router — PRD-143 meal planning. The week view is a
 * denormalised read; mutations return the service's discriminated
 * `{ ok, ... }` result on 200 (the FE narrows on the reason). Only
 * `weekView` can 400 (a date that passes the regex but isn't a real day).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, NonEmptyString, PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const SlugLike = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase-kebab-case');

const PlanSlotRowSchema = z.object({
  slug: z.string(),
  name: z.string(),
  displayOrder: z.number().int(),
  isDefault: z.boolean(),
});

const PlanEntryRowSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  slot: z.string(),
  position: z.number().int(),
  recipeId: z.number().int(),
  recipeSlug: z.string(),
  recipeTitle: z.string(),
  recipeType: z.string().nullable(),
  heroImagePath: z.string().nullable(),
  plannedServings: z.number().int(),
  recipeVersionId: z.number().int().nullable(),
  recipeRunId: z.number().int().nullable(),
  recipeRunCookedAt: z.string().nullable(),
  notes: z.string().nullable(),
});

const WeekViewSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  slots: z.array(PlanSlotRowSchema).readonly(),
  entries: z.array(PlanEntryRowSchema).readonly(),
});

const PlanEntryError = z.enum([
  'NotFound',
  'AlreadyCooked',
  'BadDate',
  'BadSlot',
  'RecipeArchived',
  'RecipeHasNoCurrentVersion',
]);
const EntryFail = z.object({ ok: z.literal(false), reason: PlanEntryError });
const AddEntryResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), id: z.number().int(), position: z.number().int() }),
  EntryFail,
]);
const EntryMutationResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  EntryFail,
]);
const ReorderResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['BadIds', 'EmptySlot']) }),
]);
const SlotAddResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['SlugTaken', 'SlugInvalid']) }),
]);
const SlotUpdateResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['SlotNotFound', 'CannotEditDefault']) }),
]);
const SlotDeleteResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['SlotNotFound', 'CannotDeleteDefault', 'SlotInUse']),
  }),
]);

export const foodPlanContract = c.router({
  weekView: {
    method: 'GET',
    path: '/plan/week',
    query: z.object({ weekStart: IsoDate }),
    responses: { 200: WeekViewSchema, ...ERR_RESPONSES },
    summary: 'Denormalised meal-plan week view',
  },
  listSlots: {
    method: 'GET',
    path: '/plan/slots',
    responses: { 200: z.object({ slots: z.array(PlanSlotRowSchema).readonly() }) },
    summary: 'List plan slots',
  },
  addSlot: {
    method: 'POST',
    path: '/plan/slots',
    body: z.object({ slug: SlugLike, name: z.string().min(1).max(64) }),
    responses: { 200: SlotAddResult },
    summary: 'Add a plan slot',
  },
  updateSlot: {
    method: 'PATCH',
    path: '/plan/slots/:slug',
    pathParams: z.object({ slug: NonEmptyString }),
    body: z.object({
      name: z.string().min(1).max(64).optional(),
      displayOrder: z.number().int().nonnegative().optional(),
    }),
    responses: { 200: SlotUpdateResult },
    summary: 'Update a plan slot',
  },
  deleteSlot: {
    method: 'DELETE',
    path: '/plan/slots/:slug',
    pathParams: z.object({ slug: NonEmptyString }),
    body: z.object({}).optional(),
    responses: { 200: SlotDeleteResult },
    summary: 'Delete a plan slot',
  },
  addEntry: {
    method: 'POST',
    path: '/plan/entries',
    body: z.object({
      date: IsoDate,
      slot: SlugLike,
      recipeId: z.number().int().positive(),
      plannedServings: z.number().int().positive(),
      recipeVersionId: z.number().int().positive().optional(),
      notes: z.string().max(1000).optional(),
    }),
    responses: { 200: AddEntryResult },
    summary: 'Add a plan entry',
  },
  updateEntry: {
    method: 'PATCH',
    path: '/plan/entries/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({
      plannedServings: z.number().int().positive().optional(),
      recipeVersionId: z.number().int().positive().nullish(),
      notes: z.string().max(1000).nullish(),
    }),
    responses: { 200: EntryMutationResult },
    summary: 'Update a plan entry',
  },
  moveEntry: {
    method: 'POST',
    path: '/plan/entries/:id/move',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({
      date: IsoDate,
      slot: SlugLike,
      position: z.number().int().nonnegative().optional(),
    }),
    responses: { 200: EntryMutationResult },
    summary: 'Move a plan entry to another date/slot',
  },
  deleteEntry: {
    method: 'DELETE',
    path: '/plan/entries/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: EntryMutationResult },
    summary: 'Delete a plan entry',
  },
  reorderSlot: {
    method: 'POST',
    path: '/plan/reorder',
    body: z.object({
      date: IsoDate,
      slot: SlugLike,
      orderedIds: z.array(z.number().int().positive()).min(1),
    }),
    responses: { 200: ReorderResult },
    summary: 'Reorder entries within a date/slot cell',
  },
});
