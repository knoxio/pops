# US-05: Fan-out and ranking

> PRD: [057 — Search Engine](README.md)
> Status: To Review

## Description

As a developer, I want query fan-out to all adapters with context-aware ranking so that results are ordered by relevance.

## Acceptance Criteria

- [ ] Query sent to all registered adapters in parallel
- [ ] Results collected and merged
- [ ] Context from PRD-058 determines section ordering (current app first)
- [ ] Within a section, results ordered by relevance score
- [ ] Results limited per section (e.g., top 5 per domain, expandable)
- [ ] Total result count per section for "show more" UI
- [ ] Fast: total search time < 200ms for local queries

## Notes

Fan-out is parallel — all adapters query simultaneously. The engine collects, sections, ranks, and returns. Context ordering is the key differentiator from a flat search.
