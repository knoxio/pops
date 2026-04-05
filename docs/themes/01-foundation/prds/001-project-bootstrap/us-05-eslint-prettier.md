# US-05: Set up ESLint and Prettier

> PRD: [001 — Project Bootstrap](README.md)
> Status: Done

## Description

As a developer, I want ESLint and Prettier configured so that code style is enforced consistently across all packages.

## Acceptance Criteria

- [x] ESLint installed with TypeScript parser
- [x] Flat config format (`eslint.config.js`)
- [x] Prettier installed and configured
- [x] Shared config at root, extended by packages — root `.prettierrc` exists; packages inherit it
- [x] `pnpm lint` and `pnpm format:check` work from root via Turbo

## Notes

ESLint flat config (not legacy `.eslintrc`). TypeScript-aware rules enabled. Prettier handles formatting — ESLint handles logic/correctness.
