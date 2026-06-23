# Epic: UI Component Library

> Theme: [Foundation](../README.md)

## Scope

Build `@pops/ui` — a workspace library (`libs/ui/`) containing all shared UI components, design tokens, and Storybook stories. Every pillar frontend and the shell consume components from this library. No app-specific or domain-specific components live here.

## PRDs

| PRD                                                                | Summary                                                                                               | Status  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------- |
| [Design Tokens & Theming](../prds/design-tokens-theming/README.md) | Tailwind v4 config, colour system (including app colour variable), spacing, typography, breakpoints   | Partial |
| [Components](../prds/components/README.md)                         | Primitive (Shadcn/Radix) and composite components, all consuming design tokens — no hardcoded colours | Partial |
| [Storybook](../prds/storybook/README.md)                           | Config, story discovery across all packages, co-location pattern                                      | Done    |

Design tokens go first (tokens before components). Components and Storybook can parallelise after that.

## What This Delivers

- **Primitives** — Shadcn/Radix-based: Button, Input, Select, Dialog, Table, Tabs, Card, Badge, Accordion, Tooltip, etc.
- **Composites** — DataTable (filtering, sorting, pagination), form inputs (text, number, date, autocomplete, combobox, chip), StatCard, ErrorBoundary
- **Design tokens** — Tailwind v4 CSS variables (oklch colour system), spacing, typography, breakpoints
- **Centralised styling** — Default styles live here, app pages extend them
- **Storybook** — Config discovers stories from all packages via globs, stories co-locate with components

## Dependencies

- **Requires:** [Project Bootstrap](project-bootstrap.md) (monorepo toolchain)
- **Unlocks:** [Shell & App Switcher](shell-app-switcher.md) (shell needs components), all pillar frontends

## Out of Scope

- Domain-specific components (TransactionCard, MediaCard — those live in app packages)
- Page components
- Domain stores
