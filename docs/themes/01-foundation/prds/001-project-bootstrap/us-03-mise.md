# US-03: Configure mise

> PRD: [001 — Project Bootstrap](README.md)
> Status: Done

## Description

As a developer, I want mise configured as the task runner and tool version manager so that common operations are available via `mise <task>` and Node version is pinned automatically.

## Acceptance Criteria

- [x] `mise.toml` exists at repo root
- [x] Node version is pinned (auto-installed when entering the directory)
- [x] `mise dev` starts all dev servers (API + shell)
- [x] `mise dev:api`, `mise dev:shell`, `mise dev:storybook` start individual servers
- [x] `mise test`, `mise build`, `mise typecheck`, `mise lint` run correctly
- [x] `mise db:init`, `mise db:seed`, `mise db:clear` manage the dev database
- [x] `mise tasks` lists all available tasks

## Notes

mise serves two roles: tool version management (Node pinning) and task running. AI agents benefit from auto-pinned Node — no manual `nvm use` required.
