# US-04: Scope-Filtered Output

> PRD: [PRD-083: Document Generation](README.md)
> Status: Done

## Description

As a user generating documents for a specific audience (e.g., a work report, a personal review), I want all generated output to respect scope boundaries and hard-block secret content unless I explicitly opt in, so that I never accidentally include personal content in a work document or leak secret content in any output.

## Acceptance Criteria

- [x] Every generation request accepts an `audienceScope` parameter that defines the intended audience (e.g., `work.*`, `personal.*`, `work.projects.karbon`)
- [x] When `audienceScope` is provided, retrieval is filtered to only include engrams whose scopes match the audience scope prefix — engrams outside the audience scope are excluded at query time, not post-generation
- [x] When `audienceScope` is omitted, it defaults to the broadest non-secret scope among the retrieved sources
- [x] The `*.secret.*` hard-block excludes all engrams with any `*.secret.*` scope from retrieval and document content unless `includeSecret: true` is explicitly passed
- [x] An engram with both a matching audience scope and a secret scope (e.g., `[work.projects.karbon, work.secret.jobsearch]`) is excluded unless `includeSecret: true` is passed — the most restrictive scope wins
- [x] `includeSecret: true` combined with an `audienceScope` only includes secret content within that audience scope — e.g., `audienceScope: work.*, includeSecret: true` includes `work.secret.*` but not `personal.secret.*`
- [x] The generated document's metadata includes the `audienceScope` that was applied, so the user can verify what filtering was active
- [x] Scope filtering is implemented as a retrieval-time filter (Thalamus query parameter), not a post-generation content scrub — secret content never enters the LLM context window

## Notes

- This story is a cross-cutting concern applied to all three generation modes (report, summary, timeline). It should be implemented as middleware or a shared filtering layer, not duplicated per mode.
- The retrieval-time enforcement is critical — post-generation scrubbing is insufficient because the LLM could have already synthesised information from secret sources into the generated text. The secret content must never reach the LLM prompt.
- See [ADR-020](../../../architecture/adr-020-hierarchical-scope-model.md) for the full rationale behind the scope model and secret-scope hard-blocking.
- The `audienceScope` default (broadest non-secret scope) should be computed from the union of scopes across all retrieved sources, picking the shortest common prefix.
