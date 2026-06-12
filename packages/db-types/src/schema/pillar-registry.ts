import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Pillar registry: one row per pillar process that has registered with
 * `pops-core-api` at boot. Drives discovery for the shell + SDK
 * (PRD-161, Theme 13).
 *
 * Storage rules
 * - `pillarId` is the canonical lowercase-kebab pillar id (`finance`,
 *   `media`, ...). It is the primary key; one row per pillar.
 * - `manifestJson` is the verbatim `ManifestPayload` (PRD-157) the
 *   pillar POSTed at register time, serialized as JSON. Re-parsed by
 *   the snapshot reader. The router validates the wire shape before
 *   it ever reaches this table — invalid manifests do not persist.
 * - `contractPackage`, `contractVersion`, `contractTag` are denormalised
 *   from the manifest so consumers can filter / index without a JSON
 *   parse on every read.
 * - `registeredAt` is set on first INSERT and preserved across UPSERTs.
 *   `lastHeartbeatAt` updates on every register (treated as a heartbeat
 *   too) and on every explicit heartbeat (PRD-162, deferred).
 * - `status` is one of `'healthy' | 'unavailable' | 'unknown'`. Starts
 *   as `'healthy'` on register; transitions to `'unavailable'` via the
 *   missed-heartbeat logic in PRD-162; transitions to `'unknown'` only
 *   after core-api restart reconciliation (PRD-164).
 */
export const pillarRegistry = sqliteTable(
  'pillar_registry',
  {
    pillarId: text('pillar_id').primaryKey(),
    baseUrl: text('base_url').notNull(),
    manifestJson: text('manifest_json').notNull(),
    contractPackage: text('contract_package').notNull(),
    contractVersion: text('contract_version').notNull(),
    contractTag: text('contract_tag').notNull(),
    registeredAt: text('registered_at').notNull(),
    lastHeartbeatAt: text('last_heartbeat_at').notNull(),
    status: text('status').notNull(),
    statusUpdatedAt: text('status_updated_at').notNull(),
  },
  (table) => [index('idx_pillar_registry_status').on(table.status)]
);
