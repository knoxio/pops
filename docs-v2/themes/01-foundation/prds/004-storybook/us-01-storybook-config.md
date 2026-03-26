# US-01: Set up Storybook configuration

> PRD: [004 — Storybook](README.md)
> Status: Partial

## Description

As a developer, I want a Storybook app that discovers stories from all workspace packages so that I can browse and develop components visually in one place.

## Acceptance Criteria

- [ ] `apps/pops-storybook/` exists with `.storybook/main.ts` and `.storybook/preview.ts` — Storybook is at `packages/ui/.storybook/` (wrong location); config is `main.js` not `main.ts`
- [x] Story discovery globs cover `packages/ui/src/**/*.stories.tsx` and `packages/app-*/src/**/*.stories.tsx`
- [x] `mise dev:storybook` starts Storybook without errors
- [x] Stories from `@pops/ui` appear in the Storybook sidebar
- [x] Stories from app packages (finance, media, inventory) appear in the Storybook sidebar
- [x] Storybook uses the same Tailwind/CSS setup as the main app (imports `@pops/ui/theme`)
- [ ] No story files exist in `apps/pops-storybook/` — N/A (app does not exist at the specified path)

## Notes

Storybook 9 uses a different config format than earlier versions. Check the latest documentation for correct `main.ts` structure and addon configuration.
