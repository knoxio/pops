# US-03: Scope Filtering Service

> PRD: [Scope Model](README.md)
> Status: Done

## Description

As a system, I need a query-time scope filtering service so that outputs only include content appropriate for the current context, with secret scopes hard-blocked unless explicitly opted in.

## Acceptance Criteria

- [x] A `filterByScopes` function queries the `engram_scopes` table using SQL prefix matching (`WHERE scope LIKE 'work.%'`) and returns engram IDs that match any of the requested scope prefixes
- [x] Secret scope hard-blocking: engrams with any `*.secret.*` scope are excluded from results by default — even if the engram also has a non-secret scope that matches the query
- [x] Secret scopes are included only when the caller explicitly passes `includeSecret: true` — there is no implicit way to access secret content
- [x] Prefix matching handles all hierarchy levels: querying `work` matches all stored scopes starting with `work.` (e.g., `work.projects`, `work.projects.karbon`, `work.secret.jobsearch`). Filter prefixes can be 1+ segments — this is distinct from stored scopes which must be 2-6 segments. The last example is excluded unless secret opt-in is active
- [x] An empty scopes array in the query input returns all non-secret engrams (no scope filter applied, but secret blocking still active)
- [x] The service supports context-inferred scope selection: a `inferScopesFromContext` utility maps contextual hints (e.g., `"at work"` maps to `["work"]`, `"personal"` maps to `["personal"]`) to scope prefixes for downstream filtering
- [x] The filtering service composes with the existing `cerebrum.engrams.list` query — it provides a scope filter clause that integrates into the list query's WHERE conditions rather than being a separate post-filter
- [x] Performance: prefix matching uses the `scope` index on `engram_scopes` — no full table scans for scope filtering

## Notes

The hard-blocking of secret scopes is the most critical business rule in the scope model. An engram tagged `[work.projects.karbon, work.secret.jobsearch]` must be excluded from a `work.*` query unless `includeSecret` is explicitly `true`. The filtering service does not decide what scopes to query — that is Ego's responsibility (Epic 03). This service takes scope prefixes and returns filtered results. Context inference (`inferScopesFromContext`) is a simple keyword map for now — LLM-based scope inference is out of scope (PRD-081).
