# US-05: Set up ESLint and Prettier

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want ESLint and Prettier configured so that code style is enforced consistently across all packages.

## Acceptance Criteria

- [ ] ESLint flat config (`eslint.config.js`) in each package/app
- [ ] No `eslint-disable` directives anywhere — fix the issue, don't suppress
- [ ] `.prettierrc` at repo root with consistent formatting rules
- [ ] `pnpm lint` / `mise lint` passes across all packages
- [ ] `pnpm format:check` passes (no unformatted files)

## Notes

ESLint flat config (not legacy `.eslintrc`). TypeScript-aware rules enabled. Prettier handles formatting — ESLint handles logic/correctness.
