# US-04: Ingestion Filters

> PRD: [PRD-090: Plugin Architecture](README.md)
> Status: Done

## Description

As a user, I need per-adapter ingestion filter rules so that I can control which content from external sources is worth keeping and avoid flooding my knowledge base with noise.

## Acceptance Criteria

- [x] Each adapter can have zero or more filter rules stored in the `plexus_filters` table, with fields: `filter_type` (`include` or `exclude`), `field` (adapter-specific field name to match against), `pattern` (regex pattern), and `enabled` (boolean)
- [x] Filters are also definable in `plexus.toml` under each adapter's section as an array of filter objects — these are synced to the database on load:
  ```toml
  [adapters.email]
  # ...
  [[adapters.email.filters]]
  type = "exclude"
  field = "subject"
  pattern = "^\\[JIRA\\]"
  [[adapters.email.filters]]
  type = "include"
  field = "from"
  pattern = ".*@company\\.com$"
  ```
- [x] Filter evaluation order: if both include and exclude filters exist, include filters are evaluated first (only content matching at least one include filter passes), then exclude filters remove matches from the included set. If only exclude filters exist, all content passes except excluded matches. If only include filters exist, only matching content passes
- [x] The `field` value is adapter-specific — email adapters filter on `subject`, `from`, `to`; GitHub adapters filter on `event_type`, `repo`, `author`; calendar adapters filter on `calendar_name`, `category`. Each adapter documents its filterable fields
- [x] Patterns support regex syntax (anchored — full match unless `.*` is used). Invalid regex patterns are caught at filter load time and the filter is disabled with a warning log
- [x] Filter evaluation happens in the plugin system before content is sent to the ingestion pipeline — filtered content is counted (reflected in `filtered` count returned by sync) but not ingested
- [x] `cerebrum.plexus.filters.set` replaces all filters for an adapter atomically — this is a full replace, not a merge, to simplify conflict resolution
- [x] Filters can be toggled individually via the `enabled` field without removing them — useful for temporarily disabling a filter during debugging

## Notes

- Filters are essential for high-volume sources — a GitHub adapter without filters would ingest every notification, issue update, and CI event. The default should be no filters (ingest everything), with the user adding filters based on what turns out to be noise.
- Regex patterns should be tested against adapter output during the adapter setup process — consider providing a "test filter" endpoint that runs the filter against recent adapter data and shows what would be included/excluded.
- Filter evaluation should be fast — it runs on every ingested item. Compile regex patterns once at load time, not on every evaluation.
- The email adapter might need special handling for multipart MIME content — the `field` value for email should support matching against headers, not the full email body.
