# US-03: Pattern Detection

> PRD: [PRD-084: Proactive Nudges](README.md)
> Status: Partial

## Description

As a user, I want the system to detect recurring topics, emerging themes, and contradictions across my engrams and surface them as insights so that I notice patterns in my thinking, identify topics that deserve deeper treatment, and catch inconsistencies.

## Acceptance Criteria

- [x] A `PatternDetector` analyses the engram corpus to identify three pattern types: recurring topics (same subject mentioned in `patternMinOccurrences` or more engrams), emerging themes (topic frequency increasing over a rolling window), and contradictions (engrams expressing opposing positions on the same subject)
- [x] Recurring topic detection uses tag frequency analysis and Thalamus topic clustering to find subjects that appear across multiple engrams within a configurable time window (default 30 days)
- [x] Emerging theme detection tracks topic frequency over time and flags topics whose occurrence rate is accelerating (e.g., mentioned 2x in month 1, 5x in month 2, 10x in month 3)
- [ ] Contradiction detection uses LLM-based analysis on pairs of engrams with high topical overlap but low content similarity — the LLM determines whether they express contradictory positions
- [x] Pattern nudges include the pattern type, the topic or theme identified, the engram IDs involved, and a suggested action: `review` (examine the pattern) or `link` (create explicit links between related engrams)
- [x] Pattern nudges have `priority: medium` for recurring topics and emerging themes, `priority: high` for contradictions
- [ ] Contradiction nudges include excerpts from both sides of the contradiction so the user can quickly assess without opening both engrams

## Notes

- Pattern detection is the most computationally expensive nudge type — it involves tag analysis, embedding clustering, and LLM calls. It should run less frequently than staleness detection (e.g., weekly rather than daily).
- Contradiction detection is inherently fuzzy — the LLM should be prompted to be conservative and only flag clear contradictions, not minor nuances or evolving opinions.
- Consider distinguishing between "evolved thinking" (opinion changed over time) and "true contradiction" (simultaneously held conflicting views) — only the latter warrants a high-priority nudge.
- The suggested `link` action creates bidirectional links between the related engrams using `cerebrum.engrams.link` from PRD-077.
