# US-01: Tooling setup

> PRD: [Module Import Boundaries](README.md)
> Status: In progress

## Description

As a contributor, I want a single `pnpm lint:boundaries` command at the repo root so that I can validate cross-module import discipline locally without learning a new tool.

## Acceptance Criteria

- [ ] `dependency-cruiser` is added as a root devDependency.
- [ ] A `.dependency-cruiser.cjs` config exists at the repo root with TypeScript path resolution wired.
- [ ] `pnpm lint:boundaries` exists as a root script and exits non-zero on rule violations.
- [ ] The script runs against `apps/pops-api/src/modules/**` and `packages/app-*/src/**` only (no other globs in scope).
- [ ] Running the script on the post-baseline tree exits zero.

## Notes

- `dependency-cruiser` is standalone of oxlint; the existing lint pipeline is unchanged.
- Use `dependency-cruiser`'s built-in TypeScript resolver (`tsConfig`) so workspace `@pops/*` aliases resolve correctly.
- Speed: cache to `node_modules/.cache/dependency-cruiser` is acceptable; no extra pre-build required.
