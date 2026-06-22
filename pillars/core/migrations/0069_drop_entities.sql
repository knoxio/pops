-- Core pillar — PRD-163 (contacts plan N5): drop the entities table.
--
-- Entities are now owned by the contacts pillar, which is the authoritative
-- store. Finance live-fetches the contact set from contacts (#3499) and the
-- orchestrator federates entities-search to contacts, so core no longer serves
-- `/entities` or its `/search` slice. No other core table carries a foreign
-- key to `entities(id)` (the column is referenced only by URI strings in
-- finance, which are opaque text — not a DB-level FK), so the table drops in
-- place with no rebuild.
--
-- DEPLOY ORDER: this migration ships in the core image that removes the
-- entities surface and MUST roll out only AFTER the core→contacts data
-- migration has run and contacts has been observed serving production reads
-- (the plan's irreversible Gate G5). The only rollback is a litestream restore
-- of `core.db` plus reverting the deletion PR.

DROP TABLE IF EXISTS `entities`;
