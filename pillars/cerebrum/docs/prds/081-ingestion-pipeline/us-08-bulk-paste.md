# US-08: Bulk Paste Capture

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As a user migrating content from another system (Notion, Apple Notes, a text dump) or pasting a backlog of thoughts at once, I want to paste many engrams in one submission separated by a delimiter so that I do not have to capture them one at a time.

## Acceptance Criteria

- [x] The capture surface (US-01) recognises a line containing only `---` (three hyphens, optional surrounding whitespace) as an engram boundary
- [x] Pasting content with one or more `---` separators and submitting creates N engrams (one per non-empty segment) through `cerebrum.ingest.quickCapture`, each enqueueing its own enrichment job
- [x] Empty segments (only whitespace between two separators) are skipped silently — they do not create engrams and do not appear in the result list
- [x] The submit button label reflects the segment count when the body contains separators (e.g. "Capture 7 entries" instead of "Capture")
- [x] A small inline preview above the submit button shows the detected segment count and the first 60 characters of each segment so the user can sanity-check before submitting
- [x] Submission processes segments in order and returns when all engrams have been written; the result view shows a list of created engrams with id, fallback scope, and a per-row enrichment status that updates in place per US-07
- [x] If a single segment fails (validation error, write failure), the remaining segments still process; the failed segment is shown in the result list with the error message and a "retry" action that re-submits just that segment
- [x] Each segment's derived title follows the pipeline's existing title-derivation rules (first H1 if present, otherwise first line, with standard truncation)
- [x] A keyboard shortcut (e.g. Cmd/Ctrl+Shift+Enter) explicitly forces split-on-`---` even if the user did not see the separator preview, for muscle-memory-driven bulk submits

## Notes

- The split happens client-side before any API call — the API contract is unchanged. Each segment is a separate `quickCapture` mutation.
- Segments are processed sequentially (not parallel) on the client to keep result ordering deterministic and avoid hammering the API. The per-segment latency budget is the same 500 ms as US-01.
- The `---` separator deliberately matches YAML frontmatter fence syntax. If a segment starts with `---` followed by `key: value` lines and a closing `---`, the existing pipeline normaliser handles it as body content (not as ingest-time metadata). Lifting frontmatter out of pasted segments is out of scope here — it would belong with the JSON-body lift logic on the agent-input path if added later.
- Bulk paste does not expose Advanced fields — bulk paste is capture-mode only. Users who need explicit type/scopes per entry should capture one at a time.
- The result list reuses the same per-engram card from US-07 so review and edit work the same way regardless of capture mode.
