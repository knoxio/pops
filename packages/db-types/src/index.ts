/**
 * `@pops/db-types` — shared constants surface.
 *
 * After PRD-245 US-01..US-08 every Drizzle table, inferred row alias,
 * and per-pillar type shim relocated to its owning pillar package
 * (`@pops/<pillar>-db`). The remaining surface is the cross-pillar
 * literal-union constants exported below.
 *
 * Frontend packages (`@pops/app-finance`, `@pops/app-inventory`) keep
 * this dependency for the constants — the package no longer pulls in
 * Drizzle or any backend-only module, so it stays browser-safe.
 *
 * Backend consumers should import tables and inferred row aliases from
 * the owning `@pops/<pillar>-db` package directly.
 */
export * from './constants.js';
