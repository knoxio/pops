-- POPS-3334 (finance ADR-005): a provider pass stages into a pending draft and
-- writes a batch only at commit, so "last fed" has to be recorded by the pass
-- itself, empty or not.
ALTER TABLE `account_import_config` ADD `last_synced_at` text;
