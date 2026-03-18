# Theme: Foundation

> Extract the shared platform that all POPS apps build on.

## Strategic Objective

Transform the current single-app codebase (finance-focused PWA + API) into a multi-app platform with a shared shell, component library, and modular API. Every app in the roadmap depends on this work.

## Success Criteria

- A new app can be scaffolded and integrated into the shell with minimal boilerplate
- Shared components are consumed from a package, not copy-pasted
- The API supports multiple domain modules without coupling between them
- The shell handles app switching, navigation, theming, and auth — apps only provide their pages and domain components
- Everything works on mobile viewports (responsive PWA)

## Epics (ordered by dependency)

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [pnpm Migration](epics/00-pnpm-migration.md) | Replace Yarn v1 with pnpm | Not started |
| 1 | [UI Library Extraction](epics/01-ui-library-extraction.md) | Extract shared components into `@pops/ui` package | Not started |
| 2 | [Shell Extraction](epics/02-shell-extraction.md) | Extract shell from pops-pwa, convert finance to app package | Not started |
| 3 | [API Modularisation](epics/03-api-modularisation.md) | Rename to pops-api, domain module structure, promote entities to core | Not started |
| 4 | [DB Schema Patterns](epics/04-db-schema-patterns.md) | Migration conventions, entity types, cross-domain FK patterns | Not started |
| 5 | [Responsive Foundation](epics/05-responsive-foundation.md) | Audit and fix shell + shared components for mobile viewports | Not started |

Epic 0 is a prerequisite to everything. Epics 3 and 4 can run in parallel. Epic 5 depends on 1 and 2.

## Key Decisions to Make

These need to be resolved in PRDs or ADRs before implementation:

1. **Shell architecture** — Single SPA with lazy-loaded route modules? Or separate Vite builds composed at runtime? (Recommendation: single SPA, code-split by route.)
2. **Component library packaging** — Internal workspace package with Vite library mode? Or just path aliases? How does Storybook fit?
3. **Routing strategy** — Flat routes (`/media/movies`, `/finance/transactions`) or nested app routers? How does the app switcher interact with the router?
4. **API module boundaries** — How isolated are domain routers? Can they import each other's services for cross-domain queries? Or do cross-domain queries go through a separate layer?
5. **Shared entities** — Entities currently belong to finance. When media and inventory also reference entities, where does the entity module live?
6. **Migration strategy** — How do we get from the current pops-pwa to the new structure without a big-bang rewrite? Can finance continue working throughout?

## Risks

- **Big-bang refactor trap** — Extracting the shell and component library touches every file in pops-pwa. Need a migration strategy that keeps finance working at every step.
- **Premature abstraction** — We're designing a multi-app platform with only one app. The patterns we establish may not fit apps we haven't built yet. Keep it minimal.
- **Storybook migration** — 40+ existing stories need to move with the components. Breaking the Storybook setup blocks UI development.

## Out of Scope

- Building any new app (that's Phase 2)
- AI features
- Mobile-native anything (responsive PWA is in scope, native app is not)
- Changing the database engine or API framework
