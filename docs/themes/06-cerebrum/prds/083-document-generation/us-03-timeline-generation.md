# US-03: Timeline Generation

> PRD: [PRD-083: Document Generation](README.md)
> Status: Done

## Description

As a user, I want to generate chronological timelines from dated engrams — decisions over time, project evolution, personal milestones — so that I can visualise the progression of a topic or project as a linear narrative.

## Acceptance Criteria

- [x] The `cerebrum.emit.generateTimeline` procedure accepts optional filters (scopes, dateRange, audienceScope, includeSecret, types, tags) and returns a `GeneratedDocument` formatted as a timeline
- [x] The timeline is a chronological list of entries ordered by engram creation date (oldest first), each containing: date (formatted as `YYYY-MM-DD`), title, type badge (e.g., `[decision]`, `[meeting]`), and a one-line summary
- [x] Optional grouping by type produces parallel timelines (one per type) within the same document, each with its own chronological sequence
- [x] Optional grouping by month/quarter produces section headers that break the timeline into time periods
- [x] A timeline with a single entry is valid — returned with a note that it represents a single point in time
- [x] Metadata-only engrams (empty body) are included in the timeline with their title and date but marked as "metadata only" in place of a summary
- [x] The timeline's `dateRange` in the response reflects the actual span from the earliest to latest included engram
- [x] Source citations reference every engram included in the timeline

## Notes

- Timelines are structurally simpler than reports — they are primarily a formatting exercise over chronologically sorted engrams with LLM-generated one-line summaries.
- The one-line summary per engram should be generated once and cached (by content hash) to avoid redundant LLM calls when the same engram appears in multiple timeline requests.
- Timeline output is Markdown — it uses a definition list or numbered list format. Future enhancements could add visual timeline rendering (out of scope for this PRD).
- Consider including engram links in the timeline — if engram A links to engram B, the timeline could show the connection.
