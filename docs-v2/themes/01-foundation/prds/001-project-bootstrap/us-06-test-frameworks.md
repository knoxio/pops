# US-06: Set up Vitest and Playwright

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want Vitest for unit/integration tests and Playwright for e2e tests so that code correctness is verified at multiple levels.

## Acceptance Criteria

- [ ] Vitest configured in each package/app that has tests
- [ ] `pnpm test` / `mise test` runs all unit/integration tests across packages
- [ ] `mise test:watch` runs tests in watch mode
- [ ] Playwright configured for e2e tests
- [ ] E2e tests can run against dev servers
- [ ] MSW (Mock Service Worker) available for API mocking in tests

## Notes

Vitest for unit/integration (fast, Vite-native). Playwright for e2e (browser automation). MSW for mocking external APIs in tests without hitting real services.
