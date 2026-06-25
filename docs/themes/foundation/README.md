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

## PRD Index

PRDs live under [`prds/`](prds/) as slug folders, grouped below by the area they belong to. Shell and search-UI PRDs live in the [`shell` pillar](../../../pillars/shell/docs/prds/); the API-server and Drizzle-ORM contract patterns are captured directly in the PRDs that consume them.

**Project Bootstrap** — The monorepo toolchain every pillar and library is built on: package manager, task runner, tool-version pinning, the compiled-TS build graph, strict mode, linting, formatting, and test frameworks.

| PRD                                            | Summary                                                           | Status |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------ |
| [Project Bootstrap](prds/project-bootstrap.md) | Monorepo toolchain, build graph, dev environment, test frameworks | Done   |

**UI Component Library** — `@pops/ui` (`libs/ui/`) is the single shared component library and token system; every pillar frontend and the shell consume it as source, never copy-pasting between pillars.

| PRD                                                      | Summary                                                                                                | Status  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| [Design Tokens & Theming](prds/design-tokens-theming.md) | One token system in `@pops/ui/theme`; colours, spacing, type, breakpoints; per-app accent propagation  | Partial |
| [Components](prds/components.md)                         | Primitives, composites, and patterns, all token-driven — no hardcoded colours                          | Partial |
| [Storybook](prds/storybook.md)                           | One Storybook in `@pops/ui`, story discovery across libs and pillar frontends, theme/accent decorators | Done    |

**DB Schema Patterns** — The database conventions every pillar follows: each pillar owns its own SQLite database (no shared `pops.db`), with migration journals, shared entity types, cross-pillar references as URI strings (never foreign keys), and standard column patterns.

| PRD                                              | Summary                                                                                          | Status |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------ |
| [DB Schema Patterns](prds/db-schema-patterns.md) | Per-pillar SQLite, migration journals, entity types, cross-pillar URI references, settings table | Done   |

**Responsive Foundation** — The shell and every shared `@pops/ui` component work on every viewport, from a 375px phone to a 1536px+ desktop with no horizontal overflow, CSS-driven via Tailwind v4 with no JS viewport detection.

| PRD                                                    | Summary                                                                                        | Status  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------- |
| [Responsive Foundation](prds/responsive-foundation.md) | Tailwind v4 breakpoints, mobile-first layout, touch targets, DataTable/Dialog/Form adaptations | Partial |

**Search** — Platform-wide federated search from the TopBar: the orchestrator fans a query out to every search-capable pillar, prioritises the current app context, supports structured query syntax, and links results via universal object URIs ([ADR-012](../../architecture/adr-012-universal-object-uri.md)).

| PRD                                    | Summary                                                                                                   | Status  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| [Search Engine](prds/search-engine.md) | `POST /search` per pillar, orchestrator fan-out, ranking, context-based ordering, structured query syntax | Partial |

**Settings System** — A single `/settings` route in the shell renders every pillar's configuration as a registry-driven manifest dimension; each pillar declares its sections and serves a federated `/settings/*` surface from its own database.

| PRD                                          | Summary                                                                                                  | Status |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| [Unified Settings](prds/unified-settings.md) | Registry-driven settings dimension; each pillar serves a federated `/settings/*` surface from its own DB | Done   |

**Feature Toggles** — A runtime feature-toggle layer above the settings system: each pillar declares a `FeatureManifest`, the registry aggregates every declaration from the live snapshot, and a single `isEnabled(key, { user? })` resolves state from capability, credentials, system flags, and per-user overrides.

| PRD                                                            | Summary                                                                                                      | Status |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| [Feature Toggles Framework](prds/feature-toggles-framework.md) | `FeatureManifest`, registry aggregation, `isEnabled(key, { user? })`, admin Features page, credential gating | Done   |

**Modular Module Runtime** — The installed fleet is a runtime decision, not a compile-time one: a shell / app / overlay surface model, the manifest contract every pillar exports, the env-driven install set, and lint-enforced cross-unit import boundaries.

| PRD                                                          | Summary                                                                                                | Status |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| [Module Import Boundaries](prds/module-import-boundaries.md) | dependency-cruiser rule set, known-violations baseline, CI gate that blocks new cross-unit violations  | Done   |
| [Overlay Surfaces](prds/overlay-surfaces.md)                 | Overlay surface category, `overlay-ego` extraction, ego as a dual-surface (page + floating panel)      | Done   |
| [Plugin Contract](prds/plugin-contract.md)                   | The manifest contract with all cross-cutting slots, self-registration, build-time registry drift guard | Done   |

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
