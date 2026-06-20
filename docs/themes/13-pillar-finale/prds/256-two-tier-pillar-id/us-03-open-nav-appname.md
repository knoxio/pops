# US-03: Open `AppName` / app-context to `PillarId`

> PRD: [PRD-256 — Two-tier pillar id](README.md)

## Description

As the shell's navigation layer, I want the app-context pillar id typed as `PillarId` rather than the
closed `AppName` union, so that a registry-discovered pillar can be the active app/nav surface without
the type system forbidding it.

## Acceptance Criteria

- [x] `packages/navigation/src/types.ts` no longer forces the active-app/nav-surface id through the closed `AppName` union (`:9`). The app-context id accepts `PillarId`.
- [x] Any remaining closed `AppName` use is justified — kept **only** where a `switch` over a finite known set genuinely earns it (e.g. a built-in default-route table), not as a blanket gate on which pillars may surface.
- [x] `IconName` and other unrelated unions in the file are untouched.
- [x] `pnpm typecheck` green repo-wide; the shell builds.
- [x] No `as any` / suppression introduced at the nav boundary.

## Notes

This US opens the **type** only. The actual registry-walk rewrite that deletes `registeredApps` /
`KNOWN_FRONTEND_MANIFESTS` and derives nav from the registry is [PRD-243](../243-registry-driven-shell-ui/README.md)
(us-03); the two compose — PRD-243 needs `AppName` to not reject unknown ids, which is exactly what this
US delivers. Coordinate ordering with PRD-243 to avoid churn: this type change can land first and is a
no-op for the current seven app surfaces.
