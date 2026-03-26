# ADR-003: Component Library as Workspace Package

## Status

Accepted

## Context

POPS has a shared UI component library (`@pops/ui`) consumed by multiple app packages. The library needs to be easy to develop against, require no separate build step, and support a single Storybook instance across all packages.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Workspace package (source consumption) | No build step, Vite resolves natively, simple setup | All consumers must use the same bundler |
| Published npm package | True isolation, versioned releases | Build pipeline, version management overhead, overkill for one repo |
| Path aliases only (no package) | Zero config | No clear boundary, no independent testing, no package.json |

## Decision

`@pops/ui` is a workspace package consumed as source (not compiled artifacts). Vite resolves it via TypeScript path resolution.

- **In `@pops/ui`:** Shadcn/Radix primitives, composite components (DataTable, forms, inputs), layout primitives, Tailwind config and CSS variables, utility functions
- **In app packages:** Domain-specific components, page components, domain stores
- **Storybook:** Config-only app that discovers stories from all packages via globs. Stories co-locate with their components

## Consequences

- No build pipeline for the component library — just write and import
- Tailwind v4 config (CSS-first, no JS config) and design tokens live in `@pops/ui`, shared by all consumers
- Clear ownership boundary: if a component is used by 2+ apps, it moves to `@pops/ui`
