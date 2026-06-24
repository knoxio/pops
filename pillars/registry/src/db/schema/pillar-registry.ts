import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Pillar registry: one row per pillar process that has registered with the
 * registry pillar at boot. Drives discovery for the shell + SDK.
 *
 * Storage rules
 * - `pillarId` is the canonical lowercase-kebab pillar id (`finance`,
 *   `media`, ...). It is the primary key; one row per pillar.
 * - `manifestJson` is the verbatim `ManifestPayload` the pillar POSTed at
 *   register time, serialized as JSON. Re-parsed by the snapshot reader. The
 *   router validates the wire shape before it ever reaches this table —
 *   invalid manifests do not persist.
 * - `contractPackage`, `contractVersion`, `contractTag` are denormalised
 *   from the manifest so consumers can filter / index without a JSON
 *   parse on every read.
 * - `registeredAt` is set on first INSERT and preserved across UPSERTs.
 *   `lastHeartbeatAt` updates on every register (treated as a heartbeat
 *   too) and on every explicit heartbeat.
 * - `status` is one of `'healthy' | 'unavailable' | 'unknown'`. Starts
 *   as `'healthy'` on register; transitions to `'unavailable'` via the
 *   missed-heartbeat logic; transitions to `'unknown'` only after registry
 *   restart reconciliation.
 * - `origin` distinguishes `'internal'` (in-tree bootstrap path) from
 *   `'external'` (registered via the plain HTTP-JSON endpoint). `apiKeyHash`
 *   is a nullable column; the trust boundary is the docker network
 *   (ADR-027), so new rows write `null`. `evictedAt` is set by the
 *   hard-eviction ticker for external pillars that never heartbeated;
 *   internal pillars are never hard-evicted.
 * - `capabilitiesJson` is the latest reported capability-status snapshot
 *   (`<capabilityKey> → up/down`) the pillar POSTed on register or
 *   heartbeat, serialized as JSON. NULL when the pillar reports no
 *   capabilities; the snapshot reader then omits the `capabilities` field.
 *   Distinct from `manifestJson`, which carries the *declarative*
 *   `capability: { pillar, key }` descriptors — this column carries their
 *   *live status*.
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
    origin: text('origin').notNull().default('internal'),
    apiKeyHash: text('api_key_hash'),
    evictedAt: text('evicted_at'),
    capabilitiesJson: text('capabilities_json'),
  },
  (table) => [
    index('idx_pillar_registry_status').on(table.status),
    index('idx_pillar_registry_origin').on(table.origin),
  ]
);
