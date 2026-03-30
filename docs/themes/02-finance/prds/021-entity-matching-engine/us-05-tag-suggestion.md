# US-05: Tag suggestion pipeline

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want tags suggested for each transaction from multiple sources so that the user starts with sensible defaults.

## Acceptance Criteria

- [x] Priority chain (no duplicates): correction tags → AI category → entity default tags
- [x] Correction tags: from matched correction rule (source: "rule", includes pattern text)
- [x] AI category: only if it case-insensitively matches an existing tag in the database
- [x] Entity default tags: from entity.defaultTags (source: "entity")
- [x] Each tag includes source attribution for UI badges
- [x] Deduplicated: each tag appears only once regardless of how many sources suggest it
- [x] Output: `{ tag, source: "rule" | "ai" | "entity", pattern?: string }[]`

## Notes

The tag pipeline runs after entity matching. It uses results from all three matching approaches (corrections, rules, AI) to build the best possible tag set.
