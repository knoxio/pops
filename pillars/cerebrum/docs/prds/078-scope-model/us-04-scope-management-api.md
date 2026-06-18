# US-04: Scope Management API

> PRD: [Scope Model](README.md)
> Status: Done

## Description

As a user, I want tRPC procedures for managing scopes on engrams so that I can assign, remove, reclassify, list, and validate scopes through the API.

## Acceptance Criteria

- [x] `cerebrum.scopes.assign` adds one or more scopes to an engram — validates each scope string (US-01), updates the engram's frontmatter `scopes` array, writes the file, and updates the `engram_scopes` index table
- [x] `cerebrum.scopes.remove` removes one or more scopes from an engram — rejects the operation if it would leave the engram with zero scopes, updates file and index
- [x] `cerebrum.scopes.reclassify` performs a bulk scope rename: replaces `fromScope` prefix with `toScope` across all matching engrams, updates every affected file's frontmatter and the index, and is atomic (rolls back all changes if any single file write fails)
- [x] `cerebrum.scopes.reclassify` supports a `dryRun` flag that returns the count and list of affected engram IDs without modifying anything
- [x] `cerebrum.scopes.list` returns all distinct scopes from the `engram_scopes` table with the count of engrams per scope, optionally filtered by a prefix parameter
- [x] `cerebrum.scopes.validate` accepts a scope string and returns `{ valid: true }` or `{ valid: false, errors: [...] }` with specific validation error messages (uses the schema from US-01)
- [x] `cerebrum.scopes.filter` accepts scope prefixes and an optional `includeSecret` flag, delegates to the filtering service (US-03), and returns matching engrams
- [x] All procedures use Zod input validation with the scope schema from US-01 — malformed scope strings are rejected before any database or file operations

## Notes

This is the API layer that composes the schema (US-01), rules engine (US-02), and filtering service (US-03). The `assign` procedure should call `resolveScopes` from US-02 when no explicit scopes are provided (e.g., during engram creation). The `reclassify` procedure is the most complex — it must update both files and the database atomically. Consider wrapping the file writes in a try/catch that restores original file contents on failure before rolling back the database transaction. The `filter` procedure is a convenience wrapper around the filtering service for direct API access — `cerebrum.engrams.list` also uses the filtering service internally.
