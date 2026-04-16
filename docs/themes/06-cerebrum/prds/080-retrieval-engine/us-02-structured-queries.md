# US-02: Structured Queries

> PRD: [PRD-080: Retrieval Engine](README.md)
> Status: Not started

## Description

As a system querying Thalamus, I want to filter engrams by type, scope, date range, tags, status, and custom frontmatter fields using the SQLite index so that I can retrieve precisely matching records without relying on semantic similarity.

## Acceptance Criteria

- [ ] A `StructuredQueryService` accepts a filters object and builds a parameterised SQL query against `engram_index` and its junction tables (`engram_scopes`, `engram_tags`)
- [ ] Supported filters: `types` (array of type strings, OR match), `scopes` (array of scope prefixes, OR match using `LIKE 'prefix%'`), `tags` (array of tag strings, AND match — engram must have all specified tags), `dateRange` (from/to ISO 8601 strings filtering on `created_at`), `status` (array of status strings, OR match), `customFields` (key-value pairs queried via `json_extract()` on the `custom_fields` column)
- [ ] Scope filtering excludes engrams with any `.secret.` scope segment unless `filters.includeSecret` is explicitly `true`
- [ ] Results are returned as `RetrievalResult[]` with `matchType: 'structured'`, ordered by `modified_at` descending by default
- [ ] The `limit` parameter caps results (default 20, max 100); an `offset` parameter supports pagination
- [ ] Results include full metadata from the index: `type`, `source`, `status`, `scopes` (from junction table), `tags` (from junction table), `created_at`, `modified_at`, `word_count`, and `custom_fields`
- [ ] Orphaned index entries (`status: orphaned`) are excluded from results unless explicitly included via `status: ['orphaned']`
- [ ] A query with no filters and no query text returns a validation error — at least one filter must be provided

## Notes

- This story queries only the SQLite index tables — it does not read engram files from disk or touch the vector index.
- Scope prefix matching uses SQL `LIKE` with the scope string as prefix: filtering by `work.projects` matches `work.projects`, `work.projects.karbon`, `work.projects.pops`, etc.
- Tag filtering uses AND semantics (all tags must be present) while type and scope filtering use OR semantics (any match). This mirrors how users typically think: "show me decisions tagged with both 'api' and 'redesign'" vs "show me decisions or research".
- The `customFields` filter uses SQLite's `json_extract()` function on the `custom_fields` TEXT column. This is not indexed and will be slower for large datasets — acceptable at the expected scale.
- Sorting could be extended later (by `created_at`, `word_count`, relevance) but `modified_at` desc is sufficient for now.
