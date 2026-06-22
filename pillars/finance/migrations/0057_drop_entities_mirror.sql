-- Finance pillar — PRD-163 US-03 (contacts plan N3).
--
-- Entities are now owned by the contacts pillar. Finance no longer mirrors the
-- `entities` table: the import matcher and the entity-usage rollup fetch the
-- contact set live from contacts over the pillar SDK and join/match it in
-- memory per request (no persistent copy). Drop the mirror table; nothing
-- references it (the `entity_id` columns on `transactions` / corrections /
-- tag-rules are plain text, never a foreign key).

DROP TABLE IF EXISTS `entities`;
