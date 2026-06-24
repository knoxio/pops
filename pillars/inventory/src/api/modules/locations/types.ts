import { z } from 'zod';

import type { LocationRow } from '../../../db/index.js';

/** API response shape for a location. */
export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
  };
}

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number(),
});

export const CreateLocationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;

export const UpdateLocationSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
