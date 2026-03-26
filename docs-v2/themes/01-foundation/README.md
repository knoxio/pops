# Theme: Foundation

> Build the shared platform that all POPS apps run on.

## Strategic Objective

Build a multi-app platform from a shared foundation: one monorepo, one shell, one component library, one API server, one database. Every app plugs in as a workspace package — it provides its pages and domain logic, the platform handles layout, navigation, theming, routing, auth, and responsive design.

## Success Criteria

- A new app can be scaffolded as a workspace package and integrated into the shell with minimal boilerplate
- Shared components are consumed from `@pops/ui`, not copy-pasted between apps
- The API supports multiple domain modules without coupling between them
- The shell handles app switching, navigation, theming, and auth — apps only provide their pages
- Styling is centralised in the component library — app pages extend defaults rather than overriding them
- Each app declares a theme colour once and it propagates automatically to all components within that app
- Everything works on mobile viewports (responsive PWA)
- A developer can clone the repo, install dependencies, and have a working dev environment in under 5 minutes

## Epics

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Project Bootstrap](epics/00-project-bootstrap.md) | pnpm monorepo, Turbo, mise, TypeScript strict, ESLint, Prettier, Vitest, Playwright | Done |
| 1 | [UI Component Library](epics/01-ui-component-library.md) | `@pops/ui` — Shadcn/Radix primitives, composites, design tokens, centralised styling, Storybook | Done |
| 2 | [Shell & App Switcher](epics/02-shell-app-switcher.md) | `pops-shell` — lazy-loaded apps, AppRail, responsive sidebar, app theme colour propagation | Partial (theme colour propagation not implemented) |
| 3 | [API Server](epics/03-api-server.md) | `pops-api` — Express + tRPC, domain-grouped routers, middleware (auth, rate limiting, errors) | Done |
| 4 | [DB Schema Patterns](epics/04-db-schema-patterns.md) | SQLite, timestamp migrations, shared entities, cross-domain FKs, seed data, UUIDs | Done |
| 5 | [Responsive Foundation](epics/05-responsive-foundation.md) | Tailwind v4 breakpoints, mobile-first, 44x44px touch targets, component adaptations | Done |
| 6 | [Drizzle ORM](epics/06-drizzle-orm.md) | Type-safe queries and schema-as-code, replacing raw SQL | Not started |
| 7 | [Search](epics/07-search.md) | Platform-wide search from TopBar, context-aware results, structured query syntax, cross-domain via universal URIs | Not started |

Epic 0 is prerequisite to everything. Epics 1-5 can be built incrementally. Epic 6 is independent.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | SQLite | One file, zero dependencies, good enough for single-user |
| ORM | Drizzle (planned) | Type-safe queries, schema-as-code. Raw SQL doesn't scale to 40+ tables |
| Frontend | React SPA, Vite | Fast dev server, code splitting, mature ecosystem |
| Styling | Tailwind v4 only | Utility-first, design tokens as CSS variables, no CSS modules or inline styles |
| Component base | Shadcn/Radix | Accessible primitives, unstyled, composable |
| API | tRPC over Express | End-to-end type safety, no codegen |
| Package manager | pnpm | Fast, strict, disk-efficient |
| Task runner | mise | Polyglot, simple config |
| Monorepo orchestration | Turbo | Caches builds, parallelises tasks |

## Risks

- **Premature abstraction** — Multi-app platform designed with limited apps built. Keep patterns minimal, let them evolve
- **Storybook maintenance** — Stories must stay in sync with components. Broken stories block UI development
- **Drizzle migration scope** — Large surface area across all modules. Migrate incrementally

## Out of Scope

- Building any domain app (Phase 2+)
- AI features (separate theme)
- Mobile-native anything (responsive PWA is in scope, native app is Phase 5)
- Infrastructure and deployment (separate theme)
