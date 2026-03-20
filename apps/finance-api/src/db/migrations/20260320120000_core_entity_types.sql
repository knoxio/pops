-- Migration: 20260320120000_core_entity_types.sql
-- Domain: core
-- Description: Enforce entity type system — set NULL types to 'company' and
--   add DEFAULT so new rows always have a type. The five supported values
--   (company, person, place, brand, organisation) are validated at the
--   application layer, not via CHECK constraint, to keep the column extensible.
--
-- What it changes:
--   - Backfills NULL type values to 'company'
--   - (NOT NULL + DEFAULT cannot be added to existing columns in SQLite, so
--     enforcement is handled by application code and initializeSchema for
--     fresh databases.)
--
-- Rollback (manual):
--   -- No destructive changes. To revert:
--   -- UPDATE entities SET type = NULL WHERE type = 'company';

UPDATE entities SET type = 'company' WHERE type IS NULL;
