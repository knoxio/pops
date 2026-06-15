# US-02: Document the server-side `pillar('<other>').*` consumer pattern

> PRD: [PRD-247 — core.settings.\* cross-pillar SDK surface](README.md)

## Description

As an engineer flipping a cross-pillar call site (PRD-247, PRD-248, PRD-249, and any future H8 burn-down), I want a single reference doc that nails down the server-side `pillar()` consumer pattern so each PRD does not re-derive the conventions. The pattern doc lives under `docs/themes/13-pillar-finale/notes/` and is referenced from PRD-247 US-03, PRD-248, and PRD-249.

## Acceptance Criteria

- [x] `docs/themes/13-pillar-finale/notes/server-pillar-sdk-consumer-pattern.md` exists and covers:
  - [x] **Async signature contract.** Every cross-pillar call is `await`-ed. Wrapping functions become `async`. Show a before/after diff for `settingsService.getSettingOrNull(...)` → `await pillar('core').settings.get(...)`.
  - [x] **`PillarCallError` handling.** When to `try/catch` vs let it bubble. Hot paths (Plex sync) bubble; user-facing handlers translate to `TRPCError`.
  - [x] **Service-account auth.** `POPS_INTERNAL_API_KEY` env var, where it loads, fail-closed behaviour. Local-dev `.env.local`, CI fixture, container deploy.
  - [x] **Discovery-cache.** Per-`pillarId` handle cache in-process, TTL inherits from registry config. Hot loops do not refetch discovery.
  - [x] **`getMany` / batch-read pattern.** When to use it. The Plex sync code path is the worked example.
  - [x] **Mixed-tx coordination.** Reference PRD-248's "Option D" — commit pillar-local first, then fire cross-pillar SDK; idempotent retries absorb partial failure.
  - [x] **When NOT to use the typed proxy.** External-pillar callers use `callDynamic` per [internal-vs-external-pillar-call-sites](internal-vs-external-pillar-call-sites.md). The doc cross-links.
- [x] The doc reads as a how-to for the burn-down PRs, not as a SDK architecture explainer. It is concrete: snippets, error-handling examples, anti-patterns.
- [x] PRD-247 README, PRD-248 README, PRD-249 README all link to the doc.

## Notes

- Keep it ~1 page. The audience is engineers actively migrating call sites; the pattern doc is a reference, not a tutorial.
- Anti-patterns to call out explicitly:
  - **Naive N-call port** of a batch read. Always check whether the target surface has a `*Many` shape.
  - **Catch-and-fallback to direct `@pops/<other>-db` read.** This re-introduces the H8 violation. The pattern is: surface the error, let the caller decide.
  - **Top-level `await pillar('<other>')` at module scope.** Triggers `POPS_INTERNAL_API_KEY` check at import time. Use lazy proxy access inside the function.
- The doc is referenced by PRD-248 and PRD-249, which inherit the conventions. They do not re-state them.
