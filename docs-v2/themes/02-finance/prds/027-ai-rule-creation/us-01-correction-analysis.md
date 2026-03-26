# US-01: Send correction to Claude for pattern analysis

> PRD: [027 — AI Rule Creation](README.md)
> Status: To Review

## Description

As a developer, I want user corrections sent to Claude so that the AI can suggest a matching pattern for future imports.

## Acceptance Criteria

- [ ] When a user assigns an entity to an uncertain transaction, the correction is sent to Claude
- [ ] Prompt includes: description, entity name, context (amount, account)
- [ ] Claude returns: `{ matchType, pattern, confidence }`
- [ ] matchType is one of: "exact", "prefix", "contains"
- [ ] Pattern has minimum length of 3 characters
- [ ] Confidence is 0-1 range
- [ ] AI failure is non-fatal — correction still works, just no pattern created
- [ ] Cost tracked in ai_usage table
- [ ] Named environments skip AI calls

## Notes

The prompt should guide Claude to identify what part of the description is the entity vs location/branch/noise. "IKEA TEMPE NSW" → entity is "IKEA", "TEMPE NSW" is location noise → prefix match on "IKEA".
