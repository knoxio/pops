-- One-time dedupe: for each pair+dimension, keep only the most recent comparison (highest id).
-- Normalizes pair order using the same logic as normalizePairOrder() in service.ts:
-- sort by (media_type || ':' || media_id) string comparison.
DELETE FROM comparisons
WHERE id NOT IN (
  SELECT MAX(id)
  FROM comparisons
  GROUP BY dimension_id,
    CASE WHEN media_a_type || ':' || media_a_id <= media_b_type || ':' || media_b_id
         THEN media_a_type ELSE media_b_type END,
    CASE WHEN media_a_type || ':' || media_a_id <= media_b_type || ':' || media_b_id
         THEN media_a_id ELSE media_b_id END,
    CASE WHEN media_a_type || ':' || media_a_id <= media_b_type || ':' || media_b_id
         THEN media_b_type ELSE media_a_type END,
    CASE WHEN media_a_type || ':' || media_a_id <= media_b_type || ':' || media_b_id
         THEN media_b_id ELSE media_a_id END
);--> statement-breakpoint
-- Reset ELO scores after dedupe — scores are stale since comparisons were deleted.
-- Use recalcAll endpoint (POST /comparisons/recalc-all) to rebuild from remaining comparisons.
UPDATE media_scores SET score = 1500.0, comparison_count = 0;
