# Epic 01: UI Component Library

> Theme: [Foundation](../README.md)

## Scope

Build `@pops/ui` — a workspace package containing all shared UI components, design tokens, and Storybook stories. Every app consumes components from this package. No app-specific or domain-specific components live here.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 002 | [Design Tokens & Theming](../prds/002-design-tokens-theming/README.md) | Tailwind v4 config, colour system (including app colour variable), spacing, typography, breakpoints | Partial |
| 003 | [Components](../prds/003-components/README.md) | Primitive (Shadcn/Radix) and composite components, all consuming design tokens — no hardcoded colours | Done |
| 004 | [Storybook](../prds/004-storybook/README.md) | Config, story discovery across all packages, co-location pattern | Partial |

PRD-002 goes first (tokens before components). PRD-003 and PRD-004 can parallelise after that.

## What This Delivers

- **Primitives** — Shadcn/Radix-based: Button, Input, Select, Dialog, Table, Tabs, Card, Badge, Accordion, Tooltip, etc.
- **Composites** — DataTable (filtering, sorting, pagination), form inputs (text, number, date, autocomplete, combobox, chip), StatCard, ErrorBoundary
- **Design tokens** — Tailwind v4 CSS variables (oklch colour system), spacing, typography, breakpoints
- **Centralised styling** — Default styles live here, app pages extend them
- **Storybook** — Config discovers stories from all packages via globs, stories co-locate with components

## Dependencies

- **Requires:** Epic 00 (monorepo toolchain)
- **Unlocks:** Epic 02 (shell needs components), all app packages

## Out of Scope

- Domain-specific components (TransactionCard, MediaCard — those live in app packages)
- Page components
- Domain stores
