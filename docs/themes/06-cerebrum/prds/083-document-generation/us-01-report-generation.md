# US-01: Report Generation

> PRD: [PRD-083: Document Generation](README.md)
> Status: Done

## Description

As a user, I want to generate a structured report from a query or topic by retrieving relevant engrams and synthesising them into a coherent document with sections, so that I can produce comprehensive write-ups without manually reading and compiling dozens of engrams.

## Acceptance Criteria

- [x] The `cerebrum.emit.generateReport` procedure accepts a query string plus optional filters (scopes, audienceScope, includeSecret, types, tags) and returns a `GeneratedDocument`
- [x] The generation pipeline: (1) retrieve relevant engrams via Thalamus using the query, (2) cluster retrieved sources by subtopic, (3) generate an outline with section headings, (4) synthesise each section from its source cluster, (5) generate an introduction and conclusion
- [x] The generated report is structured Markdown with an H1 title, introduction paragraph, H2 section headings for each subtopic, and a conclusion
- [x] Every section cites the engrams it drew from using inline citation IDs (same format as PRD-082: `[engram_id]`)
- [x] The `sources` array in the response contains all cited engrams with ID, title, excerpt, and relevance score
- [x] If retrieval returns fewer than 2 relevant sources, the system returns `{ document: null, notice: "Insufficient data to generate a meaningful report" }` instead of producing a thin document
- [x] The `cerebrum.emit.preview` endpoint returns the retrieved sources and a generated outline without producing the full document — useful for user confirmation before generation
- [x] The LLM prompt instructs the model to synthesise information (not copy verbatim), maintain a tone appropriate to the audience scope, and never introduce facts not present in the source material

## Notes

- Report generation reuses the retrieval infrastructure from PRD-082 (Query Engine). The key addition is the multi-section synthesis pipeline.
- Subtopic clustering can use Thalamus embedding similarity between retrieved sources — group sources with high mutual similarity into sections.
- The generation prompt should be a configurable template, not hardcoded, to allow iteration on output quality.
- Consider implementing a token budget per section to prevent one section from consuming the entire context window.
