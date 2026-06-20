# US-02: Scope-Aware Retrieval

> PRD: [PRD-082: Query Engine](README.md)
> Status: Done

## Description

As a user asking questions in different contexts (work, personal, mixed), I want the query engine to infer the appropriate scopes from my question and filter retrieval accordingly so that answers are contextually relevant and secret content is never included without explicit opt-in.

## Acceptance Criteria

- [x] A `QueryScopeInferencer` analyses the question text to infer appropriate scopes: mentions of "work," "office," project names, or professional topics filter to `work.*`; personal references ("journal," "therapy," family names) filter to `personal.*`; ambiguous questions default to all non-secret scopes
- [x] Explicit `scopes` in the `QueryRequest` override inference entirely — when provided, the inferencer is skipped
- [x] The `*.secret.*` hard-block is enforced at retrieval time: Thalamus queries exclude engrams with any `*.secret.*` scope unless `includeSecret: true` is passed in the request
- [x] An engram with both secret and non-secret scopes (e.g., `[work.projects.karbon, work.secret.jobsearch]`) is excluded from retrieval when `includeSecret` is `false`
- [x] If the question explicitly references a secret scope or asks about known-secret topics, the response includes a notice: "This query may involve secret-scoped content. Pass includeSecret: true to include it."
- [x] The inferred scopes are included in the `QueryResponse.scopes` field so the user can see what filtering was applied
- [x] Scope inference keywords and patterns are configurable — not hardcoded — loaded from a configuration file or the scope registry

## Notes

- Scope inference for queries is distinct from scope inference for ingestion (US-06 of PRD-081). Query scope inference is about filtering retrieval, not assigning scopes to content. However, both use similar keyword/pattern matching.
- The scope inferencer should use the list of known scopes from the index to ground its inference — it should prefer existing scopes over inventing new scope patterns.
- Consider conversation state in the future (Epic 05 — Ego) — for now, each query is stateless.
- The hard-block on `*.secret.*` is a critical security boundary. It should be implemented as a Thalamus query filter, not a post-retrieval filter, to avoid secret content entering the context window at all.
