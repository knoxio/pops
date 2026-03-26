# US-05: Set up ESLint and Prettier

> PRD: [001 — Project Bootstrap](README.md)
> Status: Partial

## Description

As a developer, I want ESLint and Prettier configured so that code style is enforced consistently across all packages.

## Acceptance Criteria

- [x] ESLint flat config (`eslint.config.js`) in each package/app — all 8 packages have flat config
- [x] No `eslint-disable` directives anywhere — none found in production code
- [ ] `.prettierrc` at repo root with consistent formatting rules — no root `.prettierrc`; each package has its own (pops-api, ui, import-tools each have separate configs)
- [x] `pnpm lint` / `mise lint` passes across all packages
- [x] `pnpm format:check` passes (no unformatted files) — `format:check` script present per-package

## Notes

ESLint flat config (not legacy `.eslintrc`). TypeScript-aware rules enabled. Prettier handles formatting — ESLint handles logic/correctness.

**Audit findings**: ESLint flat configs are in all packages with TypeScript-aware rules and `recommendedTypeChecked`. No `eslint-disable` in production code. No centralized `.prettierrc` at repo root — each package manages its own Prettier config (could lead to formatting inconsistencies between packages).
