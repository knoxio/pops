# US-02: Summary Generation

> PRD: [PRD-083: Document Generation](README.md)
> Status: Done

## Description

As a user, I want to generate summaries over time ranges or topics — weekly digests, monthly reviews, topic summaries — so that I can stay on top of what I have captured without reading every individual engram.

## Acceptance Criteria

- [x] The `cerebrum.emit.generateSummary` procedure accepts a `dateRange` (required: `{ from, to }` in ISO 8601) plus optional filters (scopes, audienceScope, includeSecret, types, tags) and returns a `GeneratedDocument`
- [x] Summaries group engrams by type (decisions, meetings, journal entries, research, ideas, notes, captures) and produce a section for each type that has content in the date range
- [x] Each type section contains a bulleted list of engrams with their title, date, and a one-sentence summary synthesised from the body
- [x] If a topic filter is provided instead of (or in addition to) a date range, the summary groups by subtopic instead of by type
- [x] Summaries for empty date ranges (no engrams found) return a document with a note: "No engrams found between {from} and {to}"
- [x] The summary includes a "Highlights" section at the top with the 3-5 most significant engrams (by type importance: decisions > research > meetings > ideas > journal > notes > captures)
- [x] Source citations are included for every referenced engram — the summary acts as a navigable index into the knowledge base
- [x] The generated document's `dateRange` field in the response reflects the actual date range covered (which may differ from the requested range if the earliest/latest engrams fall within a subset)

## Notes

- The "weekly digest" and "monthly review" patterns are the primary use case — consider providing convenience shortcuts (e.g., `cerebrum.emit.generateSummary({ preset: "weekly" })`) that auto-compute the date range.
- Type importance ranking for highlights is a heuristic that can be configured — decisions and research tend to be higher-signal than captures.
- Summary generation is expected to handle large result sets (a month might have 100+ engrams) — the retrieval should cap at a reasonable limit and the summary should note when it is covering a subset.
