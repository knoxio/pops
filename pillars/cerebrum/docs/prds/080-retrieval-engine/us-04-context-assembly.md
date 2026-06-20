# US-04: Context Assembly

> PRD: [PRD-080: Retrieval Engine](README.md)
> Status: Done

## Description

As a system preparing input for an LLM, I want to take a query and its retrieval results and assemble a coherent, token-budgeted context window with source attribution so that the LLM receives the most relevant information in a structured format without exceeding its input capacity.

## Acceptance Criteria

- [x] A `ContextAssemblyService` accepts a query string, retrieval results (from hybrid search), a `tokenBudget` (default 4096), and an `includeMetadata` flag (default `true`)
- [x] Results are added to the context in descending relevance order — each result is formatted as a delimited section with a header containing source attribution (`[source_type:source_id] title`) followed by the content body
- [x] Token counting uses a fast approximation: `word_count * 1.3` — this avoids importing a full tokeniser while staying within ~10% accuracy for English text
- [x] Results are added until the next result would exceed the remaining token budget — partially fitting results are truncated at a sentence boundary (or the budget limit if no sentence boundary is found) with a `[truncated]` marker appended
- [x] If the token budget is smaller than the first result, that result is truncated to fit and a `truncated: true` flag is set in the response metadata
- [x] Duplicate content is detected by `content_hash` — if two results share the same hash (e.g., an engram and its chunk overlap), only the higher-ranked one is included
- [x] The `cerebrum.retrieval.context` procedure runs a hybrid search internally (using `cerebrum.retrieval.search`), then assembles the context from the results — it is a convenience wrapper, not a separate retrieval path
- [x] The response includes `sources: SourceAttribution[]` listing every result included in the context with `sourceType`, `sourceId`, `title`, and `relevanceScore` — this enables the LLM to cite its sources
- [x] When `includeMetadata` is `true`, each section's header includes type, scopes, tags, and date in addition to title and source attribution

## Notes

- The context format should be LLM-friendly but not model-specific. Use clear delimiters (e.g., `---` or `===`) between sections and structured headers that any instruction-following model can parse.
- Token approximation (`words * 1.3`) is intentionally conservative — slightly overestimating tokens is better than exceeding the budget. If precision becomes important later, swap in `tiktoken` or `gpt-tokenizer`.
- For engram sources, the content body is the Markdown body from the file. For domain sources (transactions, movies, etc.), the content is the `toEmbeddableText()` output from PRD-079 US-04.
- Sentence boundary detection for truncation can use a simple regex (`/[.!?]\s/`) — it does not need to be linguistically perfect.
- The `chunkRange` field in `SourceAttribution` indicates which chunks of a multi-chunk engram were included, if applicable.
