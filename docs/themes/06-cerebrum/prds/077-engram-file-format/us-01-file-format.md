# US-01: Engram File Format Specification

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Not started

## Description

As the Cerebrum system, I need a well-defined engram file format with validated YAML frontmatter, deterministic ID generation, and a consistent file naming convention so that every engram file is machine-parseable, human-readable, and uniquely identifiable.

## Acceptance Criteria

- [ ] Engram files use `.md` extension with YAML frontmatter delimited by `---` fences
- [ ] A Zod schema (`engramFrontmatterSchema`) validates all frontmatter fields per the PRD's Frontmatter Schema table: `id` (string, required), `type` (string, required), `scopes` (string array, min 1, required), `created` (ISO 8601 string, required), `modified` (ISO 8601 string, required), `source` (enum of `manual | agent | moltbot | cli | plexus:*`, required), `tags` (string array, optional), `links` (string array, optional), `status` (enum of `active | archived | consolidated | stale`, required), `template` (string, optional)
- [ ] ID generation produces the format `eng_{YYYYMMDD}_{HHmm}_{slug}` where the slug is derived from the title (lowercased, hyphenated, max 40 characters, alphanumeric and hyphens only)
- [ ] Duplicate ID detection appends a counter suffix (`_2`, `_3`, etc.) when a collision is found on disk
- [ ] File naming follows the convention `{type}/{id}.md` (e.g., `research/eng_20260417_0942_agent-coordination.md`)
- [ ] A `parseEngramFile(content: string)` function parses a raw file into validated frontmatter and a Markdown body string, throwing a typed error on invalid frontmatter
- [ ] A `serializeEngram(frontmatter, body: string)` function produces a valid engram file string with YAML frontmatter and body separated by `---`
- [ ] Status lifecycle transitions are enforced: `active` can move to `archived | consolidated | stale`; `archived` can move to `active`; `consolidated` and `stale` are terminal

## Notes

- Use `gray-matter` for YAML frontmatter parsing and serialization.
- The Zod schema should be exported from a shared location (e.g., `src/modules/cerebrum/engrams/schema.ts`) since both the service layer and API layer need it.
- Slug generation should strip diacritics and special characters before hyphenation.
- The `source` field uses a discriminated pattern — `plexus:` is a prefix followed by the plexus integration name.
