# CONVENTIONS.md

Coding conventions for the POPS codebase. Every PR must follow these. If a convention is wrong, change this file first — don't silently deviate.

## Styling

- **Tailwind only** — no CSS modules, no styled-components, no inline `style={{}}` except dynamic runtime values (progress bar widths)
- **Design tokens** — all colours reference CSS variables via Tailwind (`bg-background`, `text-foreground`, `bg-primary`). No hardcoded hex/rgb/oklch in components
- **Semantic status colours** — `text-destructive` not `text-red-500`, `text-success` not `text-green-600`. Status tokens: `destructive`, `success`, `warning`, `info`
- **App accent** — components use `bg-app-accent` / `text-app-accent`, never `bg-indigo-600` or `bg-emerald-500`. The shell sets `--app-accent` per active app
- **No arbitrary values** — no `w-[180px]` or `text-[10px]`. Use Tailwind scale values. If no match exists, add a token to `@theme` in globals.css
- **Exception** — `w-[var(--radix-*)]` bindings are permitted (runtime-computed)
- **JS colour constants** — canvas/chart code imports from `@pops/ui/theme` token objects, not hardcoded hex strings

## API Modules

Backend modules live in `apps/pops-api/src/modules/<domain>/<feature>/` with a consistent structure:

```
router.ts    — tRPC procedure definitions (input schemas, calls service)
service.ts   — business logic (queries DB, applies rules, returns data)
types.ts     — TypeScript types for the feature
index.ts     — re-exports router
*.test.ts    — tests alongside the code they test
```

- **router.ts** defines inputs (Zod), calls service functions, handles errors. No business logic in routers.
- **service.ts** owns all DB access and business rules. Services are plain functions, not classes.
- **Types** — shared types go in `packages/db-types/`. Feature-specific types stay in the module's `types.ts`.

## Frontend Packages

App packages live in `packages/app-<name>/` and register with the shell via `navConfig`:

```
src/
  routes.tsx     — navConfig + lazy route definitions
  pages/         — page components (one per route)
  components/    — feature components used by pages
```

- **Pages** are route-level components. One page = one route. Pages compose components.
- **Components** are reusable within the app. Cross-app components go in `@pops/ui`.
- **Page headers** — all drill-down pages use the shared PageHeader pattern (back button + breadcrumbs). No inline h1 styling.
- **View toggles** — table/grid toggles use `ViewToggleGroup` from `@pops/ui`. Preference persisted in localStorage.

## Component Library (`@pops/ui`)

- Primitives wrap Shadcn/Radix. Composites combine primitives.
- All components consume design tokens — no hardcoded colours or spacing.
- Every exported component needs a Storybook story.
- Icons are Lucide only. Icon-only buttons must have `aria-label`.

## Data Patterns

- **SQLite** — source of truth. All access through Drizzle ORM (no raw SQL in new code).
- **Integer PKs** for domain tables. **TEXT UUIDs** for cross-domain FKs (finance transactions, entities).
- **Timestamps** — `createdAt`/`updatedAt` as ISO 8601 TEXT columns.
- **JSON columns** — stored as TEXT, parsed on read (e.g., tags, genres).
- **Env vars** — names match `packages/infrastructure/prds/015-secrets-management` inventory. `getEnv()` reads Docker secret first, falls back to `process.env`.

## Testing

- Tests live next to the code: `service.test.ts` beside `service.ts`.
- Backend: Vitest. Test against real SQLite (in-memory), not mocks.
- Frontend: Vitest + React Testing Library for units, Playwright for E2E.
- E2E: `mise db:seed` before each run for known state.

## Git

- Never commit to `main` — PRs only.
- Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`.
- One branch = one focused task = one PR.
- Run `mise typecheck && mise lint && mise test` before pushing.
