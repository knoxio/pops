# US-06: Scope Inference

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As the Cerebrum system, I need to infer appropriate scopes for incoming content using a combination of rule-based matching (from `scope-rules.toml`) and LLM-based content analysis so that every engram is properly scoped without requiring the user to manually assign scopes every time, while ensuring user-provided scopes always take precedence.

## Acceptance Criteria

- [x] A `ScopeInferenceService` accepts `{ body: string, source: string, tags?: string[], type?: string, explicitScopes?: string[] }` and returns `{ scopes: ScopeInference[] }` where each inference has `{ scope: string, source: "explicit" | "rule" | "llm" | "fallback", confidence: number }`
- [x] The service applies a three-tier priority: (1) explicit user-provided scopes are always included with `source: "explicit"` and `confidence: 1.0`, (2) `scope-rules.toml` pattern matching adds scopes with `source: "rules"`, (3) LLM-based content analysis adds scopes with `source: "llm"` and a calibrated confidence
- [x] Rule-based matching evaluates all rules in `scope-rules.toml` against the ingestion metadata (`source`, `type`, `tags`) — all matching rules contribute their scopes (rules are additive per PRD-078)
- [x] LLM-based inference analyses the body content for scope signals: work-related language, personal topics, project references, secret/sensitive indicators — and proposes scopes from the known scope hierarchy
- [x] If explicit scopes, rules, and LLM all produce empty results, the service assigns the `defaults.fallback_scope` from `scope-rules.toml` with `source: "fallback"`
- [x] The LLM prompt for scope inference includes the list of known scopes from the index so it proposes existing scopes rather than inventing new ones
- [x] The `cerebrum.ingest.inferScopes` API endpoint exposes scope inference as a standalone operation
- [x] Inferred scopes are validated against the scope format rules (PRD-078) — invalid scopes from LLM inference are silently dropped

## Notes

- Rule-based inference is fast and deterministic — it should always run first. LLM-based inference is the expensive fallback for content that does not match any rules.
- The LLM prompt should be conservative about suggesting `*.secret.*` scopes — it is better to miss a secret scope than to over-classify, since the user can always add it manually.
- Scope inference is called during `cerebrum.ingest.submit` (when scopes are absent or partially provided) and during the background job for quick captures.
- See [ADR-020](../../../architecture/adr-020-hierarchical-scope-model.md) for the architectural rationale behind the three-tier priority model.
