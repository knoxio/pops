-- Core pillar — epic 05 / S3 cross-pillar capability status.
--
-- Pillars report their live capability statuses (`<capabilityKey> →
-- up/down`) on register + heartbeat. The latest reported snapshot per
-- pillar lands here as a JSON object so `buildRegistrySnapshot` can
-- surface `pillars[].capabilities` and core's features service can
-- resolve a `capability: { pillar, key }` feature against the owning
-- pillar's reported status. Nullable + additive: a pillar that reports
-- no capabilities leaves this NULL, which the snapshot surfaces as an
-- absent `capabilities` field (graceful degradation — an unreported
-- capability resolves to unavailable).

ALTER TABLE `pillar_registry` ADD COLUMN `capabilities_json` text;
