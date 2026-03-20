/**
 * Suggest tags for a transaction using entity defaults + correction rules.
 * Pure rule-based, synchronous — no LLM call.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../db.js";
import { entities } from "@pops/db-types";
import { findAllMatchingCorrections } from "../modules/core/corrections/service.js";

/**
 * Suggest tags for a transaction.
 *
 * Strategy:
 * 1. If entityId provided: look up entity default_tags
 * 2. Run findAllMatchingCorrections for the description → union all tags arrays
 * 3. Return deduplicated, sorted result
 */
export function suggestTags(description: string, entityId: string | null): string[] {
  const db = getDrizzle();
  const tagSet = new Set<string>();

  // 1. Entity default tags
  if (entityId) {
    const entity = db
      .select({ defaultTags: entities.defaultTags })
      .from(entities)
      .where(eq(entities.id, entityId))
      .get();

    if (entity?.defaultTags) {
      try {
        const parsed = JSON.parse(entity.defaultTags) as unknown;
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
