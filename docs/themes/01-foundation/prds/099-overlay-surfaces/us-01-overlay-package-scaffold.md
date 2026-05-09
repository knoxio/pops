# US-01: Overlay-ego package scaffold

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a maintainer, I want a `packages/overlay-ego` workspace package that owns ego's chat UI logic and a manifest declaring both `overlay` and `app` surfaces.

## Acceptance Criteria

- [ ] `packages/overlay-ego/` exists with `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/test-setup.ts`.
- [ ] Listed in `pnpm-workspace.yaml`.
- [ ] Exports `manifest: ModuleManifest` with `surfaces: ['overlay', 'app']` and `frontend.overlay.{chromeSlot, shortcut}`.
- [ ] Exports `EgoOverlay`, `EgoFab`, `ChatPanel`, `useChatPageModel`, and the chat-page types from the package root.
- [ ] `pnpm install` resolves the new workspace cleanly.
- [ ] `pnpm typecheck` and `pnpm test` (in the new package) pass.

## Notes

- The chat code is moved from `packages/app-cerebrum/src/components/chat/` and `packages/app-cerebrum/src/pages/chat-page/` via `git mv` to preserve history.
- The package's `@pops/types` dependency lets it re-use `ModuleManifest` from PRD-098.
