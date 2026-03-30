# US-03: Build middleware stack

> PRD: [008 — API Server](README.md)
> Status: Done

## Description

As a developer, I want auth, rate limiting, error handling, and environment context middleware so that cross-cutting concerns are handled consistently for all endpoints.

## Acceptance Criteria

- [x] `middleware/auth.ts` validates Cloudflare Access JWT tokens (skips in development)
- [x] `middleware/rate-limit.ts` limits requests per endpoint
- [x] `middleware/error-handler.ts` catches errors and returns consistent JSON responses with appropriate status codes
- [x] `middleware/env-context.ts` scopes requests to named environments for testing
- [x] `env-context.test.ts` verifies environment scoping
- [x] Middleware is applied in correct order in `app.ts`
- [x] Health endpoint bypasses auth middleware

## Notes

Auth middleware should be skippable in development (no Cloudflare JWT locally). Use an environment variable or config flag to disable it.
