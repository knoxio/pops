# ADR-002: Shell Architecture

## Status

Accepted (2026-03-18)

## Context

POPS is expanding from a single finance app to a multi-app platform (media, inventory, fitness, etc.). We need a frontend architecture that supports:

- Multiple "apps" with independent pages and domain components
- Shared shell (layout, navigation, app switcher, theming)
- Shared UI component library
- Good dev experience (not 20 Vite servers on different ports)
- Fast load times (not bundling everything into one 10MB chunk)
- Single Storybook instance covering the shared library and all apps

### Options Considered

**A. Single SPA with lazy-loaded route modules**
One Vite dev server, one build. Each app is a set of route modules loaded on demand via `React.lazy()` / dynamic `import()`. Vite code-splits automatically per route.

- Pros: One dev server, shared runtime, trivial cross-app navigation, simple deployment (one Docker image)
- Cons: All apps in one build graph — slow builds as app count grows, all code in one package.json

**B. Separate Vite builds composed at runtime (Module Federation)**
Each app is its own Vite project with its own build. A shell app loads them at runtime via Webpack Module Federation or Vite's federation plugin.

- Pros: Independent builds, independent deploys, true isolation
- Cons: Runtime overhead, complex dev setup (multiple Vite servers), version skew risk for shared deps, significantly more infrastructure

**C. Single SPA with workspace packages per app**
One Vite dev server and one build, but each app lives in its own workspace package (e.g., `packages/app-media/`). The shell imports them as dependencies. Vite resolves workspace packages natively.

- Pros: One dev server, logical separation per app, independent testing, shared build. Each app has its own package.json, tsconfig, and test config. Storybook can import from all packages.
- Cons: Slightly more workspace config than option A. Still one build graph.

**D. Next.js migration**
Replace Vite + React Router with Next.js. App Router provides file-based routing with automatic code splitting.

- Pros: Built-in code splitting, file-based routing, SSR if ever needed
- Cons: SSR is pointless (self-hosted, single user, no SEO). Adds server complexity. Migration effort is high for no clear benefit over Vite + React Router.

## Decision

**Option C: Single SPA with workspace packages per app.**

Rationale:

- **One dev server** — `yarn dev` starts one Vite instance. No port juggling.
- **Fast loads** — Vite code-splits per route automatically. Only the active app's code is loaded. Subsequent apps load on navigation.
- **Logical separation** — Each app is its own package with clear boundaries, its own tests, and its own dependencies. Prevents the monolith-creep that would happen with option A as we add 10+ apps.
- **One Storybook** — A single Storybook config in `apps/pops-storybook/` discovers stories from `@pops/ui` and all app packages via globs. Stories co-locate with their components, not in the Storybook app.
- **Simple deployment** — One `vite build` produces one output. One Docker image. One nginx config.
- **No Module Federation complexity** — We don't need independent deploys. We're one developer with AI agents, not five teams.
- **No Next.js overhead** — No SSR benefit for a self-hosted single-user PWA behind Cloudflare Tunnel.

## Structure

```
packages/
  ui/                  → @pops/ui (shared component library, extracted from current pops-pwa)
  app-finance/         → @pops/app-finance (finance pages + domain components)
  app-media/           → @pops/app-media (media pages + domain components)
  app-inventory/       → @pops/app-inventory (inventory pages + domain components)
  app-fitness/         → @pops/app-fitness (fitness pages + domain components)
  ...etc

apps/
  pops-shell/          → The shell: layout, app switcher, routing, theming, tRPC provider
                         Imports all @pops/app-* packages as dependencies
                         Single Vite build, single entry point
  pops-storybook/      → Storybook config only. No stories live here — discovers *.stories.tsx from all packages via globs
  pops-api/            → Backend API (renamed from finance-api)
```

### Routing

Flat, namespaced routes. The shell owns the router and registers each app's routes:

```
/finance/transactions
/finance/budgets
/media/movies
/media/tv
/inventory/items
/fitness/workouts
```

Each app package exports its routes. The shell lazily imports them:

```typescript
// pops-shell/src/app/router.tsx
const financeRoutes = lazy(() => import('@pops/app-finance/routes'))
const mediaRoutes = lazy(() => import('@pops/app-media/routes'))
```

### App Switcher

The shell sidebar becomes an app switcher. Each app registers its navigation items. Within an app, secondary navigation shows that app's pages.

## Consequences

- Finance continues to work throughout migration — we extract it into `@pops/app-finance` and the shell imports it. Same code, different packaging.
- New apps are scaffolded as workspace packages with a known structure.
- Build time scales with total code, not number of apps — but Vite is fast and code-splitting means dev mode only processes the active route.
- All apps share one version of React, tRPC client, Zustand, Tailwind. No version skew.
- Cross-app navigation is instant (SPA, no full page reload).

## Risks

- Workspace package count will grow (11 apps + ui + db-types + shell + storybook). Yarn/Turbo should handle this fine but worth monitoring.
- Circular dependency risk if app packages import from each other. Rule: apps import from `@pops/ui` and `@pops/db-types`, never from other apps. Cross-app communication goes through the API or shared stores in the shell.
