import { z } from 'zod';

import type { FixtureRow, ItemFixtureConnectionRow } from '@pops/inventory-db';

export type { FixtureRow, ItemFixtureConnectionRow };

// Single source of truth for the API shape: the Zod schema. The TS types are
// derived from it, so the wire contract and the static types cannot drift.
export const FixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  locationId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  lastEditedTime: z.string(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const ItemFixtureConnectionSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  fixtureId: z.string(),
  createdAt: z.string(),
});
export type ItemFixtureConnection = z.infer<typeof ItemFixtureConnectionSchema>;

export const CreateFixtureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  locationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateFixtureInput = z.infer<typeof CreateFixtureSchema>;

export const UpdateFixtureSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    locationId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });
export type UpdateFixtureInput = z.infer<typeof UpdateFixtureSchema>;

export const FixtureQuerySchema = z.object({
  locationId: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type FixtureQuery = z.infer<typeof FixtureQuerySchema>;

export const ConnectFixtureSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  fixtureId: z.string().min(1, 'Fixture ID is required'),
});
export type ConnectFixtureInput = z.infer<typeof ConnectFixtureSchema>;

export const FixtureConnectionQuerySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type FixtureConnectionQuery = z.infer<typeof FixtureConnectionQuerySchema>;
