/**
 * Schema for the HA bridge pillar's per-pillar SQLite store
 * (PRD-229 § Data Model).
 *
 * Defined inline in this package (not in `@pops/db-types`) because the HA
 * bridge is the first "bridge pillar" — its source of truth is upstream
 * (Home Assistant), not user data. Nothing in the rest of the platform
 * references these tables directly; consumers reach the data through the
 * bridge's tRPC surface, its `searchAdapter`, or its AI tools. Keeping
 * the schema local avoids polluting the cross-pillar barrel with rows
 * that exist only inside this container's SQLite file.
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Current snapshot of every HA entity the bridge knows about. One row per
 * entity, upserted on every state-changed event. The `attributes` blob is
 * the raw JSON from HA's `attributes` payload — never trimmed, so that
 * downstream search / AI tools have the full surface to draw from.
 */
export const haEntities = sqliteTable(
  'ha_entities',
  {
    entityId: text('entity_id').primaryKey(),
    domain: text('domain').notNull(),
    friendlyName: text('friendly_name'),
    area: text('area'),
    deviceClass: text('device_class'),
    unit: text('unit'),
    state: text('state').notNull(),
    attributes: text('attributes').notNull(),
    lastChanged: integer('last_changed').notNull(),
    lastSeen: integer('last_seen').notNull(),
  },
  (t) => [
    index('idx_ha_entities_domain').on(t.domain),
    index('idx_ha_entities_area').on(t.area),
    index('idx_ha_entities_device_class').on(t.deviceClass),
  ]
);

/**
 * Append-only log of state-changed events the bridge observes after
 * debouncing. Used by trend / time-series queries from cerebrum (US-03
 * and beyond). Pruned by a periodic worker per `HA_HISTORY_RETENTION_DAYS`
 * — the table is allowed to grow unboundedly inside the retention window.
 */
export const haStateHistory = sqliteTable(
  'ha_state_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityId: text('entity_id').notNull(),
    state: text('state').notNull(),
    attributes: text('attributes').notNull(),
    observedAt: integer('observed_at').notNull(),
  },
  (t) => [index('idx_ha_state_history_entity_observed').on(t.entityId, t.observedAt)]
);

export type HaEntityRow = typeof haEntities.$inferSelect;
export type HaEntityInsert = typeof haEntities.$inferInsert;
export type HaStateHistoryRow = typeof haStateHistory.$inferSelect;
export type HaStateHistoryInsert = typeof haStateHistory.$inferInsert;
