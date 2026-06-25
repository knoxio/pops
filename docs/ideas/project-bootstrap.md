# Idea: test API-mocking framework

Spun out of [PRD: Project Bootstrap](../themes/foundation/prds/project-bootstrap.md).

## Context

The original bootstrap spec called for MSW (Mock Service Worker) to be available for mocking external/cross-pillar APIs in tests. It is **not** in the codebase — no unit declares `msw` as a dependency, and no shared mocking layer exists. Tests that need to fake a cross-pillar call or an upstream HTTP dependency currently roll their own stubs.

## Want

A single, blessed way to mock HTTP boundaries in tests across the federation:

- Mock the `@pops/pillar-sdk` `pillar()` client (cross-pillar REST calls) without each test hand-rolling fetch stubs.
- Mock upstream integrations (Plex/TMDB/TVDB for media, bank CSV/HTTP sources for finance, etc.) at the network layer.
- Work in both Vitest (node) unit suites and Playwright e2e where a real upstream is undesirable.

MSW is the obvious candidate (interceptor-based, framework-agnostic, works in node and browser), but the decision is open — a typed in-process fake of the generated Hey API client may be a better fit than network interception now that every pillar ships a generated client.

## Not doing yet

No mocking framework is wired in. Until one is chosen, tests stub at the call site. Pick the approach, add it to the relevant units' `mise.toml test` flow, and document the pattern before reintroducing a dependency.
