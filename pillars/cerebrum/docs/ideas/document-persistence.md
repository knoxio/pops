# Idea: Document persistence, presets, export, and caching

Forward-looking extensions to the Document Generation pipeline. The generation
engine itself (report/summary/timeline + scope filtering + preview) is shipped;
everything here is deferred and not built today.

## Save generated documents (history / as engrams)

Generated documents are currently ephemeral strings — nothing is stored. The
Documents page explicitly defers history persistence. Build:

- A "save" action that writes a generated document back as an engram (or a
  dedicated generated-documents table) in the cerebrum DB, capturing the
  request params + `metadata` (sourceCount, dateRange, scopeCoverage, mode).
- A generation-history surface on the Documents page (list, reopen, regenerate
  from a saved request).
- Decide whether saved documents re-enter retrieval (a report about reports) or
  are excluded from the corpus.

## Convenience presets

`generateSummary` should accept a preset (e.g. `{ preset: "weekly" }`,
`"monthly"`) that auto-computes the `dateRange` server-side, so the common
weekly-digest / monthly-review patterns don't require the caller to compute
date bounds.

## One-line summary caching for timelines

Timeline entries currently re-synthesise per request. Cache the per-engram
one-line summary keyed by content hash so the same engram across multiple
timeline requests doesn't trigger redundant LLM calls.

## Subtopic clustering as an explicit step

Report sectioning relies on the LLM to group by subtopic from the assembled
context. A pre-LLM clustering step using Thalamus embedding similarity between
retrieved sources (group high-mutual-similarity sources into sections, with a
per-section token budget) would make sectioning deterministic and prevent one
section from consuming the whole context window.

## Output / rendering extensions

- `format: "plain"` is accepted on the wire but output is always Markdown — make
  `plain` actually strip Markdown, and add a real template layer.
- PDF / presentation export of generated documents.
- Visual timeline rendering and engram-link edges in timelines (show A→B when
  engram A links to engram B).

## Automated scheduled generation

Scheduled / triggered report generation (e.g. an automatic weekly digest) driven
by the reflex system rather than an on-demand request.

## Collaborative editing

Out of scope for the single-user system; noted for completeness.
