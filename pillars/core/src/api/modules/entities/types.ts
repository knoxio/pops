/**
 * `core.entities.*` wire shapes (camelCase API view + zod boundary).
 *
 * Relocated from `apps/pops-api/src/modules/core/entities/types.ts` as
 * part of the core-pillar fold. The finance `transactionCount` enrichment
 * is intentionally NOT carried across: that join is finance-owned and the
 * pillar's `entities` surface is the plain `entities`-table CRUD. Consumers
 * that need a transaction count read it from the finance pillar.
 */
import { z } from 'zod';

import { ENTITY_TYPES, type EntityRow } from '../../../db/index.js';

export type { EntityRow };
export { ENTITY_TYPES };

/** API response shape (camelCase) for a single entity. */
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
}

function parseDefaultTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/** Map a SQLite row to the API response shape. */
export function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    abn: row.abn,
    aliases: row.aliases
      ? row.aliases
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    defaultTransactionType: row.defaultTransactionType,
    defaultTags: parseDefaultTags(row.defaultTags),
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
  };
}

/** Zod schema for the entity response shape. */
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  abn: z.string().nullable(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string().nullable(),
  defaultTags: z.array(z.string()),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
});

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
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type EntityQuery = z.infer<typeof EntityQuerySchema>;
