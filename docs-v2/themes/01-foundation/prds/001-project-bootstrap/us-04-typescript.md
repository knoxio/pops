# US-04: Set up TypeScript

> PRD: [001 — Project Bootstrap](README.md)
> Status: Partial

## Description

As a developer, I want TypeScript configured in strict mode across all packages with a shared base config so that type safety is enforced everywhere.

## Acceptance Criteria

- [ ] Shared `tsconfig.base.json` at repo root with strict mode enabled — no shared base; each package has standalone `tsconfig.json`
- [ ] Each package/app extends the base config via `extends` — no `extends` used; configs are standalone
- [x] `as any` is forbidden — `"@typescript-eslint/no-explicit-any": "error"` in all eslint configs
- [ ] `ts-ignore` and `ts-expect-error` are forbidden — `@ts-expect-error` used in tests (intentional, for type-checking invalid input)
- [x] `pnpm typecheck` / `mise typecheck` passes across all packages
- [x] Path aliases resolve correctly across workspace packages — `@pops/*` namespace used

## Notes

Strict mode includes: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`. No escape hatches — fix the types, don't cast.

**Audit findings**: All packages have `strict: true` in their tsconfigs but no shared base config — each package manages its own tsconfig. `noUncheckedIndexedAccess` and `noImplicitReturns` are not configured. `@ts-expect-error` is used in test files for intentional type-checking of invalid inputs (not for suppressing real errors). ESLint enforces `no-explicit-any` across all packages.
