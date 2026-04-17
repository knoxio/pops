import { z } from 'zod';

import type { LocationRow } from '@pops/db-types';

export type { LocationRow };

/** API response shape for a location. */
export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

/** Map a database row to the API response shape. */
export function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
  };
}

/** A location with its children for tree responses. */
export interface LocationTreeNode extends Location {
  children: LocationTreeNode[];
}

/** Zod schema for creating a location. */
export const CreateLocationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;

/** Zod schema for updating a location. */
export const UpdateLocationSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;

/** Stats returned before confirming a delete. */
export interface DeleteLocationStats {
  /** Number of direct child locations. */
  childCount: number;
  /** Total number of descendant locations (children, grandchildren, etc.). */
  descendantCount: number;
  /** Number of inventory items directly in this location. */
  itemCount: number;
  /** Number of inventory items in this location and all descendants. */
  totalItemCount: number;
}
