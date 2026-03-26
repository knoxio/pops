# US-03: Configure mise

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want mise configured as the task runner and tool version manager so that common operations are available via `mise <task>` and Node version is pinned automatically.

## Acceptance Criteria

- [ ] `mise.toml` exists at repo root
- [ ] Node version is pinned (auto-installed when entering the directory)
- [ ] `mise dev` starts all dev servers (API + shell)
- [ ] `mise dev:api`, `mise dev:shell`, `mise dev:storybook` start individual servers
- [ ] `mise test`, `mise build`, `mise typecheck`, `mise lint` run correctly
- [ ] `mise db:init`, `mise db:seed`, `mise db:clear` manage the dev database
- [ ] `mise tasks` lists all available tasks

## Notes

mise serves two roles: tool version management (Node pinning) and task running. AI agents benefit from auto-pinned Node — no manual `nvm use` required.
