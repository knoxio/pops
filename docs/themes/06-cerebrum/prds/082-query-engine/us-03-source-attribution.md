# US-03: Source Attribution

> PRD: [PRD-082: Query Engine](README.md)
> Status: Done

## Description

As a user receiving answers from the query engine, I want every answer to cite the specific engrams it drew from — with ID, title, and a relevant excerpt — so that I can verify claims, explore source material, and build trust in the system's outputs.

## Acceptance Criteria

- [x] Every `QueryResponse` includes a `sources` array of `SourceCitation` objects, each containing `id`, `type`, `title`, `excerpt`, `relevance`, and `scope`
- [x] The LLM answer generation prompt requires inline citations using engram IDs (e.g., `[eng_20260417_0942_agent-coordination]`) — claims without citations are flagged by post-processing validation
- [x] Post-processing parses inline citation IDs from the generated answer and maps them to the `sources` array — any citation ID not present in the retrieved sources is stripped from the answer and logged as a hallucinated citation
- [x] Source excerpts are extracted from the passage within the engram body most relevant to the question — not the first paragraph or a generic summary
- [x] Excerpts are truncated to a maximum of 200 characters at a word boundary with ellipsis
- [x] Sources in the citation array are ordered by relevance score (highest first)
- [x] If the LLM generates an answer with zero valid citations, the response confidence is downgraded to `low` and a warning is included

## Notes

- Excerpt extraction should use the same relevance scoring that Thalamus uses for retrieval — the passage that scored highest against the question embedding is the excerpt.
- Hallucinated citation detection is critical — the LLM may invent plausible-looking engram IDs. The post-processing step must validate every cited ID against the retrieved source set.
- Consider linking citations to the engram view in the pops shell (future — when Ego provides a chat interface, citations could be clickable).
- The citation format (`[engram_id]`) should be consistent across all Emit outputs (query answers, reports, summaries) so users learn one pattern.
