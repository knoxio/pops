# US-03: Rule-based matching (Stages 1-5)

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want a 5-stage matching pipeline (aliases → exact → prefix → contains → punctuation strip) so that most transactions match without AI.

## Acceptance Criteria

- [x] Stage 1 (Aliases): case-insensitive substring search in description against alias map
- [x] Stage 2 (Exact): case-insensitive full description equals entity name
- [x] Stage 3 (Prefix): description starts with entity name, longest wins
- [x] Stage 4 (Contains): entity name found in description, min 4 chars, longest wins
- [x] Stage 5 (Punctuation): strip apostrophes from both sides, retry stages 2-4
- [x] Each stage returns on first match — subsequent stages skipped
- [x] Match type correctly identified in output: "alias", "exact", "prefix", "contains"
- [x] Tests cover: multi-match priority, short entity names, apostrophe handling

## Notes

Hit rate should be ~95-100% with good aliases. The 4-char minimum on contains prevents false positives (e.g., entity "IGA" matching "DIGITAL GATEWAY").
