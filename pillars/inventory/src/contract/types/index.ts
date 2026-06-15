/**
 * Public entity types for the inventory pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { Connection } from './connection.js';
export type { Item } from './item.js';
export type { Location } from './location.js';
export type { Warranty } from './warranty.js';
