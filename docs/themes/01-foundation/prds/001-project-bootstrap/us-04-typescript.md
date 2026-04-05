# US-04: Set up TypeScript

> PRD: [001 — Project Bootstrap](README.md)
> Status: Done

## Description

As a developer, I want TypeScript configured in strict mode across all packages with a shared base config so that type safety is enforced everywhere.

## Acceptance Criteria

- [x] Shared `tsconfig.base.json` at repo root with strict mode enabled
- [x] Each package/app extends the base config via `extends`
- [x] `as any` is forbidden — `"@typescript-eslint/no-explicit-any": "error"` in all eslint configs
- [x] `ts-ignore` and `ts-expect-error` are forbidden — `@ts-expect-error` used in tests (intentional, for type-checking invalid input)
- [x] `pnpm typecheck` / `mise typecheck` passes across all packages
- [x] Path aliases resolve correctly across workspace packages — `@pops/*` namespace used

## Notes

Strict mode includes: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`. No escape hatches — fix the types, don't cast.
