# Idea: tag source badges in the inline tag editor

> Forward-looking. Not built in the transactions inline editor today.

## Context

The tag-suggestion engine (`src/api/modules/tag-suggester`) already attributes each
suggested tag with a `source` — `'rule'` (with the matched `pattern`), `'ai'`, or
`'entity'` — plus an `isNew` flag for AI tags not yet in the known vocabulary. The
import wizard's tag-review step surfaces some of this attribution.

The **inline tag editor** on the transactions page (`components/tag-editor`) does NOT.
Its `GET /transactions/suggest-tags` endpoint flattens the suggestions to bare tag
strings (`tags: string[]`), discarding the source/pattern metadata, and the panel
renders plain chips + "+ tag" suggestion buttons with no source distinction.

## Build later

- Extend `GET /transactions/suggest-tags` (or add a verbose variant) to return the
  full `{ tag, source, pattern?, isNew? }[]` instead of bare strings.
- In `TagEditorPanel`, render a source badge per suggested tag:
  - `rule` → badge with the matched `descriptionPattern` as a tooltip.
  - `ai` → "AI" badge; highlight `isNew` tags.
  - `entity` → "entity" badge.
- Keep the deterministic hash colour on the chip; the badge is a secondary affordance.

## Why deferred

Pure UX enrichment — the engine and wire data needed already exist; only the inline
editor's rendering and a richer suggest payload are missing. No data-model change.
</content>
