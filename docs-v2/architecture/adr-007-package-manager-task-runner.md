# ADR-007: Package Manager & Task Runner

## Status

Accepted

## Context

POPS is a monorepo with 10+ workspace packages. It needs a package manager that handles workspaces well, a build orchestrator that caches across packages, and a task runner for non-build operations (dev servers, DB management, Docker, Ansible).

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| pnpm | Strict dependency resolution (no phantom deps), fast installs, content-addressable store, native workspaces | Different CLI from npm |
| npm workspaces | Built-in, zero install | Slower, no strict resolution, weaker workspace support |
| Yarn v4 (Berry) | Plug'n'Play, zero-installs | Complex config, PnP compatibility issues |
| Turbo (build orchestration) | Caches builds across packages, parallelises tasks, understands workspace deps | Another tool in the chain |
| mise (task runner + version manager) | Polyglot, auto Node pinning, simple config | More complex than a plain Makefile |
| just (task runner) | Simple, transparent | Doesn't manage tool versions — would need a second tool |

## Decision

pnpm + Turbo + mise. Three tools, each with a clear role:

- **pnpm** — Package management. Strict dependency resolution prevents phantom deps. Native workspace support via `pnpm-workspace.yaml`
- **Turbo** — Build orchestration. Caching across workspace packages matters as package count grows. Handles dev/build/test/typecheck/lint
- **mise** — Task runner and tool version management. Pins Node version (valuable when AI agents do development). Runs non-build tasks (DB management, Docker, Ansible, imports)

## Consequences

- Three tools with no overlap — pnpm installs, Turbo builds, mise runs tasks and pins versions
- AI agents get auto-pinned Node version without manual setup
- Strict dependency resolution catches missing dependencies early
- Turbo caching speeds up CI and repeated local builds
- All common operations available via `mise tasks` — no need to remember per-package scripts
