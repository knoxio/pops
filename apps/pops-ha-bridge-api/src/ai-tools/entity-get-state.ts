/**
 * `ha.entity.getState` — read-only AI tool (PRD-229 US-03).
 *
 * Fetches a single mirrored HA entity by `entity_id`. Returns the row on
 * success, or a typed `{ kind: 'not-found' }` discriminant when the entity
 * is not mirrored — mirrors the SDK's `CallResult` discriminant style
 * (PRD-228 / PR #3170) so a future tRPC procedure can forward the same
 * shape without translation.
 */
import { z } from 'zod';

import { getEntity, type HaBridgeDb, type HaEntityRow } from '@pops/ha-bridge-db';

export const ENTITY_GET_STATE_TOOL_NAME = 'entityGetState' as const;

export const ENTITY_GET_STATE_ENTITY_ID_MAX = 255;

export const entityGetStateInputSchema = z
  .object({
    entityId: z
      .string()
      .min(3)
      .max(ENTITY_GET_STATE_ENTITY_ID_MAX)
      .regex(
        /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/,
        'entityId must be `<domain>.<object_id>` in lowercase snake_case'
      ),
  })
  .strict();

export type EntityGetStateInput = z.infer<typeof entityGetStateInputSchema>;

export type EntityGetStateOutput = { kind: 'ok'; entity: HaEntityRow } | { kind: 'not-found' };

export function runEntityGetState(
  db: HaBridgeDb,
  input: EntityGetStateInput
): EntityGetStateOutput {
  const entity = getEntity(db, input.entityId);
  if (entity === undefined) {
    return { kind: 'not-found' };
  }
  return { kind: 'ok', entity };
}
