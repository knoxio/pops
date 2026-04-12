import type { ItemPhotoRow } from '@pops/db-types';
import { z } from 'zod';

export type { ItemPhotoRow };

/** API response shape for an item photo. */
export interface ItemPhoto {
  id: number;
  itemId: string;
  filePath: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Map a SQLite row to the API response shape. */
export function toPhoto(row: ItemPhotoRow): ItemPhoto {
  return {
    id: row.id,
    itemId: row.itemId,
    filePath: row.filePath,
    caption: row.caption,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/** Zod schema for attaching a photo to an item. */
export const AttachPhotoSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  filePath: z.string().min(1, 'File path is required'),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type AttachPhotoInput = z.infer<typeof AttachPhotoSchema>;

/** Zod schema for updating a photo. */
export const UpdatePhotoSchema = z.object({
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdatePhotoInput = z.infer<typeof UpdatePhotoSchema>;

/** Zod schema for listing photos for an item. */
export const PhotoQuerySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type PhotoQuery = z.infer<typeof PhotoQuerySchema>;

/** Zod schema for reordering photos. */
export const ReorderPhotosSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  orderedIds: z.array(z.number().int().positive()).min(1, 'At least one photo ID is required'),
});
export type ReorderPhotosInput = z.infer<typeof ReorderPhotosSchema>;
