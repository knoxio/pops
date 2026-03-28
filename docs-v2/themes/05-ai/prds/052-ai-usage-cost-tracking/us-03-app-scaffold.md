# US-03: AI app scaffold

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: Partial

## Description

As a developer, I want `@pops/app-ai` as a workspace package registered in the shell so that the AI operations app exists.

## Acceptance Criteria

- [x] `packages/app-ai/` exists with package.json, tsconfig, routes.tsx
- [ ] NavConfig exported: id "ai", label "AI", icon "Brain", color "violet", basePath "/ai" — id/label/color/basePath correct; icon is "BarChart3" not "Brain"
- [x] Registered in shell router at `/ai/*`
- [x] Lazy-loaded from the shell (via `withSuspense`)
- [x] AI usage page accessible at `/ai`
- [x] App appears in the app rail with violet accent

## Notes

Minimal app — starts with just the usage page. Future PRDs (053) add configuration and rules pages.
