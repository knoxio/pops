/**
 * Public entity types for the finance pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { WishListItem, WishListPriority } from './wish-list-item.js';
