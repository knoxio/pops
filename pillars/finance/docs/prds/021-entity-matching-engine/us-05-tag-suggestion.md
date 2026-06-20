# US-05: Tag suggestion pipeline

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want tags suggested for each transaction from multiple sources so that the user starts with sensible defaults.

## Acceptance Criteria

- [x] Priority chain (no duplicates): correction tags → tag rules → AI tags → entity default tags
- [x] Correction tags: from matched correction rule in `transaction_corrections` (source: "rule", includes pattern text)
- [x] Tag rules: `transaction_tag_rules` queried during every import by description pattern + optional entity scope (source: "rule")
- [x] AI tags: array of tags returned by AI; tags not in vocabulary marked `isNew: true` (source: "ai")
- [x] Legacy AI category: case-insensitively matched against known tags when cache entry has no tags array
- [x] Entity default tags: from entity.defaultTags (source: "entity")
- [x] Each tag includes source attribution for UI badges
- [x] Deduplicated: each tag appears only once regardless of how many sources suggest it
- [x] Output: `{ tag, source: "rule" | "ai" | "entity", pattern?: string, isNew?: boolean }[]`

## Notes

The tag pipeline runs after entity matching. It uses results from all four sources (corrections, tag rules, AI, entity defaults) to build the best possible tag set.
