# US-04: Set up TypeScript

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want TypeScript configured in strict mode across all packages with a shared base config so that type safety is enforced everywhere.

## Acceptance Criteria

- [ ] Shared `tsconfig.base.json` at repo root with strict mode enabled
- [ ] Each package/app extends the base config via `extends`
- [ ] `as any` is forbidden — causes lint/CI failure
- [ ] `ts-ignore` and `ts-expect-error` are forbidden
- [ ] `pnpm typecheck` / `mise typecheck` passes across all packages
- [ ] Path aliases resolve correctly across workspace packages

## Notes

Strict mode includes: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`. No escape hatches — fix the types, don't cast.
