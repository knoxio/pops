# US-03: Rule-based matching (Stages 1-5)

> PRD: [021 — Entity Matching Engine](README.md)
> Status: To Review

## Description

As a developer, I want a 5-stage matching pipeline (aliases → exact → prefix → contains → punctuation strip) so that most transactions match without AI.

## Acceptance Criteria

- [ ] Stage 1 (Aliases): case-insensitive substring search in description against alias map
- [ ] Stage 2 (Exact): case-insensitive full description equals entity name
- [ ] Stage 3 (Prefix): description starts with entity name, longest wins
- [ ] Stage 4 (Contains): entity name found in description, min 4 chars, longest wins
- [ ] Stage 5 (Punctuation): strip apostrophes from both sides, retry stages 2-4
- [ ] Each stage returns on first match — subsequent stages skipped
- [ ] Match type correctly identified in output: "alias", "exact", "prefix", "contains"
- [ ] Tests cover: multi-match priority, short entity names, apostrophe handling

## Notes

Hit rate should be ~95-100% with good aliases. The 4-char minimum on contains prevents false positives (e.g., entity "IGA" matching "DIGITAL GATEWAY").
