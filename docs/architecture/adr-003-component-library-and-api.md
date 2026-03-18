# ADR-003: Component Library, API Structure & Shared Entities

## Status

Accepted (2026-03-18)

## Context

Three related decisions that follow from ADR-002 (shell architecture):

1. How to package and develop the shared UI component library
2. How to structure the backend API for multiple domains
3. Where shared entities live

---

## Decision 1: Component Library as Workspace Package

`@pops/ui` is a workspace package containing all shared components.

### What goes in `@pops/ui`

- shadcn/ui base components (Button, Card, Dialog, etc.)
- Composite components (DataTable, forms, inputs, Autocomplete, etc.)
- Layout primitives used across apps
- Tailwind config and CSS variables (theming)
- Utility functions (cn(), formatters)

### What stays in app packages

- Domain-specific components (e.g., TransactionCard stays in `@pops/app-finance`)
- Page components
- Domain-specific stores

### Build & Development

- No separate build step — Vite resolves workspace packages via TypeScript path resolution. Components are consumed as source, not compiled artifacts.
- Storybook lives in `apps/pops-storybook/` but is config only — no stories live there. Stories co-locate with their components (e.g., `packages/ui/src/Button.stories.tsx`, `packages/app-finance/src/TransactionCard.stories.tsx`). Storybook discovers them via glob patterns across all workspace packages.

### Tailwind

- Shared Tailwind config and CSS variables live in `@pops/ui`
- The shell and all app packages reference the shared config
- Tailwind v4 — CSS-first configuration, no `tailwind.config.js`

---

## Decision 2: API Domain Modules

Rename `finance-api` → `pops-api`. Keep it as one Express/tRPC server. Each domain is a tRPC router module.

### Current structure (finance-only)

```
apps/finance-api/src/modules/
  transactions/
  entities/
  budgets/
  ...
```

### Target structure (multi-domain)

```
apps/pops-api/src/modules/
  core/              → entities, auth, health (shared across domains)
  finance/           → transactions, budgets, subscriptions, imports
  media/             → movies, tv-shows, watchlist
  inventory/         → items, warranties
  fitness/           → exercises, workouts, progress
  documents/         → paperless integration
  ...
```

### Module rules

- Domain modules can import from `core/` (entities, shared utilities)
- Domain modules CANNOT import from each other directly
- Cross-domain queries use the `core/` module or a dedicated cross-domain query layer
- Each module registers its own tRPC router, composed at the top level

### Why not separate services?

One SQLite database. One user. Cross-domain joins are trivial. Separate services would mean inter-service communication, distributed transactions, and multiple processes — complexity with zero benefit for this use case.

---

## Decision 3: Entities as a Core/Global Concept

Entities are promoted from a finance concept to a platform-level concept.

### Current state

Entities are merchants/payees in the finance module. ~940 records. Used for transaction matching.

### Target state

An entity is any named thing that appears across multiple domains:

- A **company**: Woolworths (finance: grocery transactions, inventory: where you bought it)
- A **person**: A friend (social: contact, finance: gift spend)
- A **service**: Netflix (finance: subscription, media: streaming platform)
- A **place**: A hotel (travel: accommodation, finance: booking cost)
- A **brand**: Sony (inventory: manufacturer, media: studio)

### Schema evolution

The entity table gains a `type` column (or tags) to distinguish categories. Relations from other domains reference the shared entity table. The existing finance entity data migrates as-is — current entities are all type `company` or `person`.

### Where it lives

- Database: `entities` table stays where it is (shared, top-level)
- API: `core/entities/` module in pops-api
- Frontend: Entity components (selector, create dialog) live in `@pops/ui` since they're used everywhere

---

## Consequences

- Component library is lightweight to set up — just a workspace package, no build pipeline
- API stays simple — one server, one database, modular routers
- Entities become the connective tissue between domains — consistent naming, linking, and search across all apps
- Storybook is centralised — one place to browse all components from all apps
- Clear import rules prevent coupling: apps → ui, apps → db-types, apps ✗→ other apps
