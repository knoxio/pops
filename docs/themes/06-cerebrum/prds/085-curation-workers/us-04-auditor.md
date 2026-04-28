# US-04: Auditor Worker

> PRD: [PRD-085: Curation Workers](README.md)
> Status: Done

## Description

As the Cerebrum system, I need an auditor worker that detects contradictions between engrams, scores content quality, and flags coverage gaps so that the knowledge base maintains internal consistency and completeness.

## Acceptance Criteria

- [x] An `AuditorWorker` class processes BullMQ jobs on the `pops:glia` queue with job name `glia:audit`
- [x] Contradiction detection groups engrams that share tags or scopes, sends pairs with overlapping topics to an LLM for comparison, and flags pairs where opposing claims are detected — producing a `GliaAction` with `action_type: 'audit'`, a rationale describing the contradiction, and a `payload` containing `{ type: 'contradiction', engramA, engramB, conflictSummary }`
- [x] Quality scoring computes a score from 0.0 to 1.0 per engram using four weighted factors: completeness (0.3 — has title, body > 50 words, at least one scope, tags > 0), specificity (0.3 — named entities and concrete details vs vague language), template fit (0.2 — percentage of template-suggested sections present), and link density (0.2 — outbound link count)
- [x] Engrams scoring below the quality threshold (default 0.3, configurable in `glia.toml` under `[auditor]`) are flagged with a `GliaAction` containing `{ type: 'low_quality', score, factors, suggestions }` where suggestions is an array of specific improvement recommendations
- [x] Coverage gap detection identifies topics (based on tag frequency and scope patterns) where the knowledge base has fewer than a configurable minimum number of engrams (default 2), producing `GliaAction` entries with `{ type: 'gap', topic, existingCount, relatedEngrams }`
- [x] Contradictions are only detected within the same top-level scope — cross-scope contradictions are not flagged
- [x] The worker checks the current trust phase for `audit` actions: in `propose` phase, it writes actions to the `glia_actions` table; in `act_report` or `silent` phase, it logs findings and optionally emits nudges (via PRD-084)
- [x] The worker skips engrams with `status: archived`, `status: consolidated`, or any scope containing `.secret.`
- [x] A `getQualityScore(engramId)` function returns the computed score with a breakdown of individual factor contributions

## Notes

- Contradiction detection is LLM-dependent and potentially expensive. The auditor should batch comparison requests and cache results — two engrams already compared in the current run should not be re-compared.
- The "specificity" factor of quality scoring can use simple heuristics (named entity count, presence of dates/numbers, sentence length variation) rather than requiring an LLM call for every engram.
- Template fit scoring assigns 0.5 (neutral) to engrams without a template — no penalty, no bonus.
- Coverage gaps are informational — the auditor flags them but does not create content. The user or Ego decides whether to fill gaps.
- Audit actions in `act_report` or `silent` phase do not modify engrams — they only log findings. The auditor is a read-only worker; it surfaces issues for the user to act on.
