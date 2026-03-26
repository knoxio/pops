# US-18: Tag source badges

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to see where each suggested tag came from so that I can trust or override the suggestions.

## Acceptance Criteria

- [ ] Each suggested tag shows a source badge icon:
  - 📋 Rule — from a correction pattern (tooltip shows the description_pattern that matched)
  - 🤖 AI — category from Claude Haiku (matched against known tags)
  - 🏪 Entity — from entity's default_tags
- [ ] Badges rendered next to or on the tag chip
- [ ] Hover tooltip on rule badges shows the pattern text
- [ ] Source attribution passed via `TagMetaEntry` map from the processing step

## Notes

Source badges help the user understand why a tag was suggested. Rule tags are highest confidence (learned from past behaviour), AI tags are moderate, entity tags are defaults.
