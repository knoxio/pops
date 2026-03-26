# US-01: Create @pops/ui package scaffold

> PRD: [003 — Components](README.md)
> Status: To Review

## Description

As a developer, I want the `@pops/ui` workspace package to exist with correct configuration so that other packages can depend on it and import components.

## Acceptance Criteria

- [ ] `packages/ui/package.json` exists with name `@pops/ui`, correct exports, peer deps on React 19
- [ ] `packages/ui/tsconfig.json` exists extending shared base, strict mode enabled
- [ ] `packages/ui/src/index.ts` exists as barrel export
- [ ] `packages/ui/src/lib/utils.ts` exists with `cn()` utility
- [ ] `pnpm install` resolves the workspace package
- [ ] Another package can `import { cn } from '@pops/ui'` and TypeScript resolves it
- [ ] No build step — Vite resolves as source

## Notes

This is the scaffold only. Components are added in US-02 through US-05.
