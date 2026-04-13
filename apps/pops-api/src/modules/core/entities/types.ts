import type { EntityRow } from '@pops/db-types';
import { ENTITY_TYPES } from '@pops/db-types';
import { z } from 'zod';

export type { EntityRow };
export { ENTITY_TYPES };

/**
 * API response shape (camelCase).
 *
 * `transactionCount` is only populated by the list endpoint (via LEFT JOIN).
 * Non-list endpoints (get/create/update) return `undefined`. Use strict
 * equality (`=== 0`) to identify orphaned entities — never a truthiness check,
 * since `undefined` would be falsely treated as orphaned.
 */
export interface Entity {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  transactionCount?: number;
}

/** Map a SQLite row to the API response shape. */
export function toEntity(row: EntityRow & { transactionCount?: number }): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    abn: row.abn,
    aliases: row.aliases
      ? row.aliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    defaultTransactionType: row.defaultTransactionType,
    defaultTags: row.defaultTags
      ? (() => {
          try {
            const parsed = JSON.parse(row.defaultTags) as unknown;
            if (Array.isArray(parsed)) {
              return parsed.filter((item): item is string => typeof item === 'string');
            }
            return [];
          } catch {
            return [];
          }
        })()
      : [],
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
    transactionCount: row.transactionCount,
  };
}

/** Zod schema for creating an entity. */
export const CreateEntitySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(ENTITY_TYPES).optional().default('company'),
  abn: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional().default([]),
  defaultTransactionType: z.string().nullable().optional(),
  defaultTags: z.array(z.string()).optional().default([]),
  notes: z.string().nullable().optional(),
});
export type CreateEntityInput = z.infer<typeof CreateEntitySchema>;

/** Zod schema for updating an entity (all fields optional). */
export const UpdateEntitySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  abn: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  defaultTransactionType: z.string().nullable().optional(),
  defaultTags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateEntityInput = z.infer<typeof UpdateEntitySchema>;

/** Zod schema for entity list query params. */
export const EntityQuerySchema = z.object({
  search: z.string().optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  orphanedOnly: z.boolean().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type EntityQuery = z.infer<typeof EntityQuerySchema>;
