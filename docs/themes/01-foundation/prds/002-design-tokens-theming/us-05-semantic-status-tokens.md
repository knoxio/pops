# US-05: Semantic status colour tokens

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Not started

## Description

As a developer, I want semantic colour tokens for status states (success, warning, info) so that components use meaningful names instead of hardcoded red/green/yellow/blue classes.

## Acceptance Criteria

- [ ] CSS variables defined in globals.css: `--color-success`, `--color-success-foreground`, `--color-warning`, `--color-warning-foreground`, `--color-info`, `--color-info-foreground`
- [ ] Light and dark mode values for all status tokens
- [ ] Tailwind utility classes available: `text-success`, `bg-success`, `border-success`, etc.
- [ ] All `text-red-500/600/700` and `bg-red-50` error/destructive patterns replaced with `text-destructive` or `text-error` tokens
- [ ] All `text-green-500/600` and `bg-green-50` success patterns replaced with `text-success` or `bg-success` tokens
- [ ] All `text-yellow-500` and `bg-yellow-50` warning patterns replaced with `text-warning` or `bg-warning` tokens
- [ ] All `text-blue-500/600` and `bg-blue-50` info patterns replaced with `text-info` or `bg-info` tokens
- [ ] `grep` for hardcoded status colour classes (`red-[0-9]`, `green-[0-9]`, `yellow-[0-9]`, `blue-[0-9]`) returns zero hits in app and UI packages (excluding Storybook stories)
- [ ] Opacity modifiers work (`bg-success/10`, `text-error/80`)

## Notes

The existing `--destructive` token covers error states but is underused — components hardcode `text-red-500` instead. This US adds the missing status tokens and migrates all instances.

Audit found 75+ hardcoded colour class instances across the import wizard, transaction pages, and media components. Most are status indicators (error borders, success icons, info badges) that should use semantic tokens.
