# Idea: Enforce reserved top-levels + auto-scope the plain create path

Forward-looking remainder split out of the Scope Model PRD. The schema, rules engine, filtering, and reconciliation all shipped; these two gaps did not.

## 1. Auto-assign scopes on the plain `engrams.create` REST path

Today rule-based auto-assignment (`ScopeRuleEngine.inferScopes` → `resolveScopes` over `scope-rules.toml`) only runs inside the **ingest pipeline**. The plain `engrams.create` REST handler does not inject a `ScopeRuleEngine`; the seam exists (`CreateDeps.scopeRuleEngine?`) but is left unwired, so a direct create with no explicit scopes and no template `default_scopes` is rejected with "at least one scope is required".

Build: wire a shared `ScopeRuleEngine` (one per engram root, cached) into the engram service's create dependencies so a manual create with no scopes falls through to source/type/tag rule inference and finally `defaults.fallback_scope`, exactly like ingest. Keep the engine a singleton per root to reuse the parsed-config cache; expose a cache reset for when the TOML is edited.

## 2. Enforce reserved top-level segments

The PRD documented `personal` / `work` / `storage` as reserved top-levels but they are purely conventional — `validateNormalised` accepts any well-formed segment as the first one. If a closed vocabulary is desired, add an optional config-driven allowlist of permitted top-level segments (default: open) so a typo'd top-level (`persona.journal`) can be rejected at the boundary instead of silently creating a parallel scope tree. Must stay opt-in — the single-user system currently benefits from free-form top-levels, and reconciliation already catches near-misses after the fact.

## Out of scope (separate PRD)

LLM-based scope classification lives in the [ingestion pipeline](../prds/ingestion-pipeline.md) — not part of this idea.
