# US-05: Fan-out and ranking

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a developer, I want query fan-out to all adapters with context-aware ranking so that results are ordered by relevance.

## Acceptance Criteria

- [ ] Query sent to all registered adapters in parallel (`Promise.allSettled`)
- [ ] If one adapter fails, other results still returned — failed adapter's section omitted with console warning
- [ ] Results collected and merged into sections (one per domain)
- [ ] Context from PRD-058 determines section ordering (current app's domain first, others alphabetical)
- [ ] Within a section, results ordered by `score` (descending) — adapters own their scoring
- [ ] Results limited to 5 per section by default (configurable via `limit` param)
- [ ] Response includes `totalCount` per section for "show more" UI
- [ ] Fast: total search time < 200ms for libraries up to 500 items per domain

## Notes

Fan-out is parallel — all adapters query simultaneously. The engine collects, sections, ranks, and returns. Context ordering is the key differentiator from a flat search.

Score range is 0.0–1.0 (set by each adapter). The engine does NOT re-score — it trusts adapter scores for within-section ordering. Cross-section ordering is purely by context (current app first).
