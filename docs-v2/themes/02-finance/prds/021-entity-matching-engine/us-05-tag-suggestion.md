# US-05: Tag suggestion pipeline

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Partial

## Description

As a developer, I want tags suggested for each transaction from multiple sources so that the user starts with sensible defaults.

## Acceptance Criteria

- [x] Priority chain (no duplicates): correction tags → AI category → entity default tags
- [x] Correction tags: from matched correction rule (source: "rule", includes pattern text)
- [ ] AI category: only if it case-insensitively matches an existing tag in the database — not yet integrated into tag suggester
- [x] Entity default tags: from entity.defaultTags (source: "entity")
- [ ] Each tag includes source attribution for UI badges — returns string[] not object array
- [x] Deduplicated: each tag appears only once regardless of how many sources suggest it
- [ ] Output: `{ tag, source: "rule" | "ai" | "entity", pattern?: string }[]` — returns string[] instead

## Notes

The tag pipeline runs after entity matching. It uses results from all three matching approaches (corrections, rules, AI) to build the best possible tag set.
