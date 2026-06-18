# US-04: Content Classification

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As the Cerebrum system, I need to classify incoming content by type (journal, decision, research, meeting, idea, note, capture) using LLM-based analysis so that engrams are automatically matched to the appropriate template and receive suggested tags, falling back to `capture` when confidence is low.

## Acceptance Criteria

- [x] A `CortexClassifier` service accepts a body string and optional context (source, existing tags) and returns `{ type: string, confidence: number, template: string | null, suggestedTags: string[] }`
- [x] The classifier uses an LLM prompt that analyses the content structure, language patterns, and context to infer the most appropriate type from the known template registry
- [x] Classification confidence is a 0-1 score — the LLM is prompted to return a calibrated confidence alongside its type selection
- [x] If confidence is below the configurable threshold (default 0.6), the type falls back to `capture` and the result includes the top candidate type and its confidence for logging
- [x] The classifier matches the inferred type to a template by name lookup against the template registry — if no template exists for the type, `template` is `null`
- [x] Suggested tags are extracted from the classification prompt response — the LLM identifies 3-8 relevant topic tags from the content
- [x] The `cerebrum.ingest.classify` API endpoint exposes classification as a standalone operation for testing and debugging
- [x] Classification results are deterministic for identical inputs within the same session (LLM temperature set to 0)

## Notes

- The LLM prompt should include the list of available template names and their descriptions so the model understands what types are available — this is not hardcoded, it is dynamically built from the template registry.
- Classification is called during the `cerebrum.ingest.submit` pipeline (when type is absent) and by the background job for quick captures.
- The confidence threshold should be configurable via `engrams/.config/cortex.toml` or similar configuration.
- Consider caching classification results by content hash to avoid redundant LLM calls for duplicate content (e.g., during reprocessing).
