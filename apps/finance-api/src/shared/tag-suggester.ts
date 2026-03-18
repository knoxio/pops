/**
 * Suggest tags for a transaction using entity defaults + correction rules.
 * Pure rule-based, synchronous — no LLM call.
 */
import { getDb } from "../db.js";
import type { EntityRow } from "@pops/db-types";
import { findAllMatchingCorrections } from "../modules/corrections/service.js";

/**
 * Suggest tags for a transaction.
 *
 * Strategy:
 * 1. If entityId provided: look up entity default_tags
 * 2. Run findAllMatchingCorrections for the description → union all tags arrays
 * 3. Return deduplicated, sorted result
 */
export function suggestTags(description: string, entityId: string | null): string[] {
  const db = getDb();
  const tagSet = new Set<string>();

  // 1. Entity default tags
  if (entityId) {
    const entity = db
      .prepare("SELECT default_tags FROM entities WHERE id = ?")
      .get(entityId) as Pick<EntityRow, "default_tags"> | undefined;

    if (entity?.default_tags) {
      try {
        const parsed = JSON.parse(entity.default_tags) as unknown;
        if (Array.isArray(parsed)) {
          for (const tag of parsed) {
            if (typeof tag === "string") tagSet.add(tag);
          }
        }
      } catch {
        // malformed JSON — ignore
      }
    }
  }

  // 2. Correction rule tags
  const corrections = findAllMatchingCorrections(description);
  for (const correction of corrections) {
    try {
      const parsed = JSON.parse(correction.tags) as unknown;
      if (Array.isArray(parsed)) {
        for (const tag of parsed) {
          if (typeof tag === "string") tagSet.add(tag);
        }
      }
    } catch {
      // malformed JSON — ignore
    }
  }

  return [...tagSet].sort();
}
