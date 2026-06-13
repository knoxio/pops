/**
 * Service helpers for the HA bridge's entity mirror.
 *
 * The mirror is intentionally tiny — the WebSocket subscriber owns all
 * write logic and there are no read endpoints in US-01 (those land in
 * US-02 / US-03). What lives here is the upsert path used by both the
 * snapshot reconciliation (`get_states` after connect) and the per-event
 * state-change handler, plus the history append used after debouncing.
 *
 * Keeping the writes here (instead of inline in the subscriber) lets the
 * unit tests cover them against an in-memory SQLite without standing up
 * a WebSocket. It also makes the snapshot vs. event paths share the same
 * code, which is the bug-class the PRD's "reconcile after reconnect"
 * rule cares about.
 */
import { eq, lt } from 'drizzle-orm';

import { haEntities, haStateHistory, type HaEntityRow } from '../schema.js';

import type { HaBridgeDb } from './internal.js';

/**
 * Minimal snapshot shape the WebSocket layer passes in. Mirrors the
 * fields the PRD's `ha_entities` table carries; the raw `attributes`
 * blob is the full HA payload serialised to JSON.
 */
export interface HaEntityMirrorInput {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  lastChanged: number;
  lastSeen: number;
  area?: string | null;
}

function domainFromEntityId(entityId: string): string {
  const idx = entityId.indexOf('.');
  if (idx <= 0) return entityId;
  return entityId.slice(0, idx);
}

function asOptionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

/**
 * Upsert a single HA entity into the mirror. Used by both the snapshot
 * pass (full reconciliation on (re)connect) and the per-event handler.
 * Returns the resulting row so tests and the subscriber can assert on
 * the persisted shape.
 */
export function upsertEntity(db: HaBridgeDb, input: HaEntityMirrorInput): HaEntityRow {
  const domain = domainFromEntityId(input.entityId);
  const friendlyName = asOptionalString(input.attributes['friendly_name']);
  const deviceClass = asOptionalString(input.attributes['device_class']);
  const unit = asOptionalString(input.attributes['unit_of_measurement']);
  const area = input.area ?? null;
  const attributesJson = JSON.stringify(input.attributes);

  const rows = db
    .insert(haEntities)
    .values({
      entityId: input.entityId,
      domain,
      friendlyName,
      area,
      deviceClass,
      unit,
      state: input.state,
      attributes: attributesJson,
      lastChanged: input.lastChanged,
      lastSeen: input.lastSeen,
    })
    .onConflictDoUpdate({
      target: haEntities.entityId,
      set: {
        domain,
        friendlyName,
        area,
        deviceClass,
        unit,
        state: input.state,
        attributes: attributesJson,
        lastChanged: input.lastChanged,
        lastSeen: input.lastSeen,
      },
    })
    .returning()
    .all();

  const row = rows[0];
  if (row === undefined) {
    throw new Error(`upsertEntity: no row returned for ${input.entityId}`);
  }
  return row;
}

/**
 * Append a single observation to `ha_state_history`. Called by the
 * subscriber after the per-entity 200ms debounce window has elapsed and
 * the latest state has been settled. Snapshot reconciliation does NOT
 * call this — the snapshot is a point-in-time refresh, not a stream of
 * observations.
 */
export function appendHistory(
  db: HaBridgeDb,
  input: {
    entityId: string;
    state: string;
    attributes: Record<string, unknown>;
    observedAt: number;
  }
): void {
  db.insert(haStateHistory)
    .values({
      entityId: input.entityId,
      state: input.state,
      attributes: JSON.stringify(input.attributes),
      observedAt: input.observedAt,
    })
    .run();
}

/**
 * Prune history rows older than `cutoffMs` (unix epoch ms). Used by the
 * retention worker. Returns the number of deleted rows so the caller can
 * log a single "pruned N rows" summary instead of one-per-entity noise.
 */
export function pruneHistory(db: HaBridgeDb, cutoffMs: number): number {
  const result = db.delete(haStateHistory).where(lt(haStateHistory.observedAt, cutoffMs)).run();
  return result.changes;
}

/**
 * Get a single entity by id — used by US-02 / US-03 once they land. Kept
 * here in US-01 so the subscriber's tests can assert "the row I just
 * upserted is readable" without depending on the future read surface.
 */
export function getEntity(db: HaBridgeDb, entityId: string): HaEntityRow | undefined {
  const rows = db.select().from(haEntities).where(eq(haEntities.entityId, entityId)).all();
  return rows[0];
}
