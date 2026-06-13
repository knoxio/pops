/**
 * `ha.entity.list` — read-only AI tool (PRD-229 US-03).
 *
 * Lists HA entities the bridge currently mirrors, optionally filtered by
 * `domain` and/or `area`. Pagination uses a stable, opaque cursor over the
 * primary key (`entity_id`) so concurrent upserts cannot shift the page
 * boundary across the result set.
 *
 * The cursor is the last `entityId` of the previous page, base64-url
 * encoded so the LLM treats it as an opaque token. We slice using
 * `entityId > cursor` after the sort by `entityId ASC`, which is the only
 * ordering that survives the source-of-truth being upstream (the bridge
 * never picks a stable `created_at`).
 */
import { z } from 'zod';

import { listEntities, type HaBridgeDb, type HaEntityRow } from '@pops/ha-bridge-db';

export const ENTITY_LIST_TOOL_NAME = 'entityList' as const;

export const ENTITY_LIST_DEFAULT_LIMIT = 50;
export const ENTITY_LIST_MAX_LIMIT = 200;

export const entityListInputSchema = z
  .object({
    domain: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, 'domain must be lowercase snake_case')
      .optional(),
    area: z.string().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(ENTITY_LIST_MAX_LIMIT).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type EntityListInput = z.infer<typeof entityListInputSchema>;

export interface EntityListOutput {
  entities: HaEntityRow[];
  nextCursor: string | null;
}

export function encodeEntityCursor(entityId: string): string {
  return Buffer.from(entityId, 'utf8').toString('base64url');
}

export function decodeEntityCursor(cursor: string): string | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function runEntityList(db: HaBridgeDb, input: EntityListInput): EntityListOutput {
  const limit = input.limit ?? ENTITY_LIST_DEFAULT_LIMIT;
  const after =
    input.cursor !== undefined ? (decodeEntityCursor(input.cursor) ?? undefined) : undefined;

  const { entities, hasMore } = listEntities(db, {
    domain: input.domain,
    area: input.area,
    limit,
    after,
  });

  const last = entities[entities.length - 1];
  const nextCursor = hasMore && last !== undefined ? encodeEntityCursor(last.entityId) : null;

  return { entities, nextCursor };
}
