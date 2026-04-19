# US-05: Entity Extraction

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Partial

## Description

As the Cerebrum system, I need to extract structured entities (people, projects, dates, topics) from engram content so that they are stored as tags and frontmatter enrichment, making engrams queryable by the entities they reference.

## Acceptance Criteria

- [x] A `CortexEntityExtractor` service accepts a body string and returns `{ entities: Entity[] }` where each entity has `{ type: string, value: string, confidence: number }`
- [x] Entity types supported: `person` (names of people), `project` (project or product names), `date` (referenced dates beyond the engram's creation date), `topic` (subject matter keywords), `organisation` (company or team names)
- [x] Extracted entities with confidence above the threshold (default 0.7) are merged into the engram's `tags` array — entity type is used as a prefix if disambiguation is needed (e.g., `person:Alice`, `project:Karbon`)
- [ ] Date entities are normalised to ISO 8601 format and stored as a `referenced_dates` custom field in the engram frontmatter
- [x] Person and organisation entities are stored with consistent capitalisation (title case for names, original case for acronyms)
- [x] Entity extraction deduplicates against existing tags — if a tag already exists (case-insensitive match), it is not added again
- [x] The `cerebrum.ingest.extractEntities` API endpoint exposes extraction as a standalone operation
- [x] Entity extraction processes content in under 2 seconds for bodies up to 5,000 words

## Notes

- Entity extraction uses the same LLM backend as classification but with a different prompt optimised for NER-style extraction.
- The entity type prefix (`person:`, `project:`, etc.) is optional — it is only added when the tag value alone would be ambiguous (e.g., "Alice" could be a person or a project). The extractor should use its judgment.
- Date extraction should handle relative dates ("last Tuesday," "next week") by resolving them against the engram's creation timestamp.
- Extraction runs during `cerebrum.ingest.submit` (after classification) and during the background job for quick captures.
