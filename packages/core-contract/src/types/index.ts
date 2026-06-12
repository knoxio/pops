/**
 * Public entity types for the core pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { RegistryEntry } from './registry-entry.js';
