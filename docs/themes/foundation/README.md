# Theme: Foundation

> The design system and app runtime every POPS pillar is built on: bootstrap, components, theming, schema patterns, search, settings, feature toggles, and the manifest/plugin contract that lets a pillar plug into the shell.

## Strategic Objective

Foundation is the shared substrate that turns a fleet of independent REST pillars into one coherent product. It owns nothing domain-specific: it owns the monorepo toolchain, the `@pops/ui` component library and design tokens, the shell that hosts every pillar frontend, the database and migration conventions each pillar follows, the federated search framework, the unified settings surface, the feature-toggle layer, the module/overlay surface model, and the import boundaries that keep every pillar independently extractable. A pillar provides its contract, its data, and its pages; Foundation provides everything else — layout, navigation, theming, routing, responsive behaviour, search wiring, settings plumbing, and the manifest handshake that makes it discoverable at runtime.

## Success Criteria

- A new pillar can be scaffolded and joined to the fleet by shipping a `./manifest` export and calling `bootstrapPillar` — no edit to the shell, the registry, or any peer.
- Shared components are consumed from `@pops/ui` (source, no build step), never copy-pasted between pillars.
- Each pillar owns its own SQLite database; cross-pillar references are URI strings, never foreign keys, and no shared `pops.db` exists.
- The shell renders app switching, navigation, theming, settings, and search from the **live registry snapshot**, with no compiled list of pillars.
- A pillar declares one accent colour and it propagates to every nested component automatically (`bg-app-accent` / `text-app-accent`), with no manual wiring.
- The shell and every `@pops/ui` component work from a 375px phone to a 1536px+ desktop with no horizontal overflow, CSS-driven, no JS viewport detection.
- Adding settings or feature toggles for a pillar requires only declaring a manifest slot — the shell and registry discover the rest.
- Cross-pillar and cross-lib internal imports are blocked by a CI lint gate; the known-violations baseline only ever shrinks.
- A developer can clone the repo and reach a working dev environment with `mise setup && mise dev`.

## Epics

| Epic                                                      | Summary                                                                                                                  | Status  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| [Project Bootstrap](epics/project-bootstrap.md)           | pnpm workspaces, mise task runner, `tsc -b` compiled graph, TypeScript strict, oxlint/oxfmt, Vitest/Playwright/Storybook | Done    |
| [UI Component Library](epics/ui-component-library.md)     | `@pops/ui` — Shadcn/Radix primitives, composites, design tokens, centralised styling, Storybook                          | Partial |
| [Shell & App Switcher](epics/shell-app-switcher.md)       | The shell — registry-driven app rail, lazy-loaded pillar frontends, two-level nav, accent propagation                    | Done    |
| [API Server](epics/api-server.md)                         | Per-pillar REST contract pattern (ts-rest + zod; axum + OpenAPI for Rust), middleware, self-registration                 | Done    |
| [DB Schema Patterns](epics/db-schema-patterns.md)         | Per-pillar SQLite, migration journals, entity types, cross-pillar URI references, PK conventions                         | Done    |
| [Responsive Foundation](epics/responsive-foundation.md)   | Tailwind v4 breakpoints, mobile-first, 44×44px touch targets, component adaptations                                      | Partial |
| [Drizzle ORM](epics/drizzle-orm.md)                       | Type-safe queries and schema-as-code per TypeScript pillar, replacing raw SQL                                            | Done    |
| [Search](epics/search.md)                                 | Federated search from the TopBar — orchestrator fan-out, context-aware ranking, structured query syntax, URI linking     | Partial |
| [Settings System](epics/settings-system.md)               | Single `/settings` route, registry-driven manifest dimension, each pillar serves its own `/settings/*` surface           | Done    |
| [Feature Toggles](epics/feature-toggles.md)               | `FeatureManifest` + `isEnabled()` resolved from the registry snapshot, admin Features page, credential gating            | Done    |
| [Modular Module Runtime](epics/modular-module-runtime.md) | Shell/app/overlay surface model, the manifest contract, env-driven install set, lint-enforced module boundaries          | Done    |

Project Bootstrap is prerequisite to everything. UI Component Library, API Server, and DB Schema Patterns build on it independently. Shell & App Switcher needs the component library; Responsive Foundation needs both the components and the shell. Drizzle ORM follows DB Schema Patterns. Settings System needs DB Schema Patterns and the shell; Feature Toggles builds on Settings System. Modular Module Runtime ties together the shell, the REST contract, and the settings manifest into the unified plugin contract.

## PRD Index

PRDs live under [`prds/`](prds/) as slug folders. The API Server and Drizzle ORM concerns are now captured by their epics ([api-server](epics/api-server.md), [drizzle-orm](epics/drizzle-orm.md)); the rest are greenfield slug PRDs here.

| PRD                                                                   | Epic                   | Summary                                                                                                      | Status  |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| [Project Bootstrap](prds/project-bootstrap/README.md)                 | Project Bootstrap      | Monorepo toolchain, build graph, dev environment, test frameworks                                            | Done    |
| [Design Tokens & Theming](prds/design-tokens-theming/README.md)       | UI Component Library   | One token system in `@pops/ui/theme`; colours, spacing, type, breakpoints; per-app accent propagation        | Partial |
| [Components](prds/components/README.md)                               | UI Component Library   | Primitives, composites, and patterns, all token-driven — no hardcoded colours                                | Partial |
| [Storybook](prds/storybook/README.md)                                 | UI Component Library   | One Storybook in `@pops/ui`, story discovery across libs and pillar frontends, theme/accent decorators       | Done    |
| [DB Schema Patterns](prds/db-schema-patterns/README.md)               | DB Schema Patterns     | Per-pillar SQLite, migration journals, entity types, cross-pillar URI references, settings table             | Done    |
| [Responsive Foundation](prds/responsive-foundation/README.md)         | Responsive Foundation  | Tailwind v4 breakpoints, mobile-first layout, touch targets, DataTable/Dialog/Form adaptations               | Partial |
| [Search Engine](prds/search-engine/README.md)                         | Search                 | `POST /search` per pillar, orchestrator fan-out, ranking, context-based ordering, structured query syntax    | Partial |
| [Unified Settings](prds/unified-settings/README.md)                   | Settings System        | Registry-driven settings dimension; each pillar serves a federated `/settings/*` surface from its own DB     | Done    |
| [Feature Toggles Framework](prds/feature-toggles-framework/README.md) | Feature Toggles        | `FeatureManifest`, registry aggregation, `isEnabled(key, { user? })`, admin Features page, credential gating | Done    |
| [Module Import Boundaries](prds/module-import-boundaries/README.md)   | Modular Module Runtime | dependency-cruiser rule set, known-violations baseline, CI gate that blocks new cross-unit violations        | Done    |
| [Overlay Surfaces](prds/overlay-surfaces/README.md)                   | Modular Module Runtime | Overlay surface category, `overlay-ego` extraction, ego as a dual-surface (page + floating panel)            | Done    |
| [Plugin Contract](prds/plugin-contract/README.md)                     | Modular Module Runtime | The manifest contract with all cross-cutting slots, self-registration, build-time registry drift guard       | Done    |

## Key Decisions

| Decision          | Choice                                | Rationale                                                                                               |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Database          | SQLite, one per pillar                | One file, zero dependencies; no shared DB means no global migration coordination                        |
| Cross-pillar refs | URI strings, never FKs                | A pillar's schema stays private and independently extractable                                           |
| ORM               | Drizzle (TypeScript pillars)          | Type-safe queries, schema-as-code; raw SQL doesn't scale across pillars                                 |
| Frontend          | React SPA, Vite                       | Fast dev server, code splitting, mature ecosystem                                                       |
| Styling           | Tailwind v4 only                      | Utility-first, design tokens as CSS variables; no CSS modules, no inline styles, no arbitrary values    |
| Component base    | Shadcn/Radix                          | Accessible primitives, unstyled, composable                                                             |
| API contract      | ts-rest + zod (axum/OpenAPI for Rust) | Per-pillar REST contract is the unit of composition; no API monolith                                    |
| Component library | `@pops/ui` consumed as source         | No build step between the library and its consumers; one source of truth for every pillar frontend      |
| Discovery         | Live registry snapshot                | Search, settings, features, nav, and dispatch are projected from the registry, never compiled in        |
| Package manager   | pnpm                                  | Fast, strict, disk-efficient workspaces                                                                 |
| Task runner       | mise                                  | Polyglot, disk-discovery fan-out across units; no central build-graph owner                             |
| Build graph       | `tsc -b` project references           | Compiled graph without Turbo; the repo is a federation of units, not a build monolith                   |
| Doc protocol      | PRD-level acceptance criteria         | Foundation PRDs are narrow enough to carry testable criteria inline rather than splitting into US files |

## Risks

- **Premature abstraction** — The platform was designed with few pillars built. Keep patterns minimal and let them evolve rather than over-fitting an imagined fleet.
- **Storybook drift** — Stories must stay in sync with components. Broken stories block UI work. Mitigation: stories co-locate with components and run in CI.
- **Boundary erosion** — Without the lint gate, cross-pillar imports creep back in and break extractability. Mitigation: the dependency-cruiser baseline only ever shrinks, enforced on every PR.
- **Registry as single point of truth** — If the registry snapshot is stale or unreachable, the shell degrades. Mitigation: consumers degrade gracefully and a pillar dropping out is removed from the next query/render, not fatal.

## Out of Scope

- Any domain pillar's data model, pages, or business logic (each pillar owns its own).
- AI features beyond the search/overlay wiring — those belong to the AI and Cerebrum themes.
- Deployment, image publishing, and host provisioning — the [Platform](../platform/README.md) theme.
- The cross-language federation contract itself (SDK wire spec, Rust peer) — the [Federation](../federation/README.md) theme; Foundation consumes the contract, it does not define it.
- Native mobile — responsive PWA is in scope, a native app is a later phase.
