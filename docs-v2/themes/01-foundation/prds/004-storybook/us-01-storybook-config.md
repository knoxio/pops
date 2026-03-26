# US-01: Set up Storybook configuration

> PRD: [004 — Storybook](README.md)
> Status: To Review

## Description

As a developer, I want a Storybook app that discovers stories from all workspace packages so that I can browse and develop components visually in one place.

## Acceptance Criteria

- [ ] `apps/pops-storybook/` exists with `.storybook/main.ts` and `.storybook/preview.ts`
- [ ] Story discovery globs cover `packages/ui/src/**/*.stories.tsx` and `packages/app-*/src/**/*.stories.tsx`
- [ ] `mise dev:storybook` starts Storybook without errors
- [ ] Stories from `@pops/ui` appear in the Storybook sidebar
- [ ] Stories from app packages (finance, media, inventory) appear in the Storybook sidebar
- [ ] Storybook uses the same Tailwind/CSS setup as the main app (imports `@pops/ui/theme`)
- [ ] No story files exist in `apps/pops-storybook/` — config only

## Notes

Storybook 9 uses a different config format than earlier versions. Check the latest documentation for correct `main.ts` structure and addon configuration.
