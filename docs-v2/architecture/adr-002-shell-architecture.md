# ADR-002: Shell Architecture

## Status

Accepted

## Context

POPS is a multi-app platform (finance, media, inventory, fitness, etc.) that needs a frontend architecture supporting:

- Multiple apps with independent pages and domain components
- Shared shell (layout, navigation, app switcher, theming)
- Shared UI component library
- One dev server, not one per app
- Fast load times via code splitting
- Single Storybook instance covering all packages

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Single SPA with lazy-loaded routes | One dev server, shared runtime, simple deployment | All code in one package.json, monolith creep as apps grow |
| Module Federation (separate Vite builds) | Independent builds/deploys, true isolation | Runtime overhead, multiple dev servers, version skew, complex infra |
| Single SPA with workspace packages per app | One dev server, logical separation, independent testing, one build | More workspace config, still one build graph |
| Next.js | Built-in code splitting, file-based routing | SSR is pointless for single-user self-hosted PWA, adds complexity for no benefit |

## Decision

Single SPA with workspace packages per app. Each app lives in its own workspace package (`packages/app-*`). The shell imports them as dependencies. Vite resolves workspace packages natively and code-splits per route.

Key reasons:
- One dev server, one build, one Docker image
- Each app has clear boundaries (own package.json, tsconfig, tests) without Module Federation complexity
- One Storybook discovers stories from all packages via globs
- No SSR overhead for a self-hosted single-user PWA
- One developer with AI agents, not five teams — independent deploys add complexity without value

## Consequences

- New apps are scaffolded as workspace packages with a known structure
- All apps share one version of React, tRPC client, Zustand, Tailwind — no version skew
- Cross-app navigation is instant (SPA, no full page reload)
- Build time scales with total code, but Vite is fast and dev mode only processes the active route
- Apps import from `@pops/ui` and shared packages, never from other apps. Cross-app communication goes through the API or shared stores in the shell
