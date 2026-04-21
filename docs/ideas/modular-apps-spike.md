# Spike — POPS as a suite of apps on a shell

Investigation. Not committed. Sibling spikes: [deployment-split](./deployment-split-spike.md), [feature-toggles](./feature-toggles-spike.md).

## Question

Restructure POPS so someone can install **only** finance, or **only** media, or "everything but ego", etc. The shell (auth, user, admin, settings, navigation, shared UI) is always present. Each app owns its data, API, and pages. Cross-app communication goes through well-defined contracts. **Apps can be added or removed progressively after install, not just at install time.**

## Current state — better than expected

The bones are already here:

- `apps/pops-shell/src/app/router.tsx:10-13` — shell statically imports four app packages (`@pops/app-finance`, `@pops/app-media`, `@pops/app-inventory`, `@pops/app-ai`) and mounts their exported routes
- `apps/pops-api/src/router.ts:24-30` — tRPC root manually composes per-domain routers (`finance`, `media`, `inventory`, `cerebrum`, `core`)
- `packages/app-*` — each app is a proper workspace package with its own `src/index.ts`, routes, pages, store. Research confirms **no app imports another app** — they only depend on `@pops/ui`, `@pops/api-client`, `@pops/navigation`, `@pops/db-types`
- [ADR-002](../architecture/adr-002-shell-architecture.md) explicitly states "apps import from `@pops/ui` and shared packages, never from other apps. Cross-app communication goes through the API or shared stores"
- [ADR-004](../architecture/adr-004-api-domain-modules.md) limits backend modules to importing from `core/` only
- `@pops/navigation` already uses a **side-effect registry** (`registerResultComponent`) for search result components; backend search adapters are a separate registry (`registerSearchAdapter`) in `apps/pops-api/src/modules/core/search` — the seed of the right pattern

So the architecture is already close. The remaining work is to make app presence a runtime decision instead of a compile-time one, and to formalise contracts.

## The shell / app boundary

Always present (the "shell"):

| Surface            | Provided by                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Auth, user, admin  | `apps/pops-api/src/modules/core/*`, `apps/pops-api/src/trpc.ts`, `apps/pops-api/src/middleware/cloudflare-jwt.ts` |
| Settings           | `apps/pops-shell/src/app/pages/SettingsPage.tsx`, `core/settings`                                                 |
| Navigation, search | `packages/navigation`, shell layout                                                                               |
| UI library         | `packages/ui`                                                                                                     |
| API client + types | `packages/api-client`, `packages/db-types` (core schema)                                                          |
| Shared entities    | `core/entities` ([ADR-005](../architecture/adr-005-shared-entities.md))                                           |

Optional (the "apps"):

| App                 | Tables owned                                                                                | Notes                                                   |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| finance             | `transactions`, `budgets`, `wishlist`, `transaction_tag_rules`                              | Uses `entities` FK                                      |
| media               | `movies`, `tv_shows`, `comparisons`, `watch_history`, `watchlist`, `rotation_*`, ~11 tables | Heaviest; external integrations (Plex, TMDB, TVDB, Arr) |
| inventory           | `home_inventory`, `item_connections`, `item_documents`, `item_photos`, `locations`          | Uses `entities` FK                                      |
| ai / ego / cerebrum | `engrams`, `embeddings`, `ai_usage`, `debrief_*`                                            | See open question on "ego" below                        |

## What has to change

### 1. App manifest

Each app package exports a manifest instead of bare `routes` + `navConfig`:

```ts
// packages/app-finance/src/index.ts
export const manifest: AppManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  frontend: { routes, navConfig, searchAdapters },
  backend: { router: financeRouter, jobs: [...] },
  schema: financeSchemas,        // drizzle tables owned by this app
  migrations: './migrations',     // app-owned migrations
  dependsOn: ['core.entities'],   // contracts consumed
  provides: ['finance.transaction', 'finance.budget'],
  settings: financeSettingsManifest,
  onInstall: async (db) => {...}, // hook for first-install side effects
  onUninstall: async (db, opts) => {...}, // hook for data retention/deletion
};
```

### 2. Runtime registry (shell + API)

- **Backend**: replace the manual `appRouter` composition with a loader that reads an "installed apps" list (from the DB `apps` table) and composes only those routers. Migrations run per-app on install.
- **Frontend**: replace the four static imports in `router.tsx` with a fetch to `/api/shell/manifest` that returns which apps are installed, then dynamic `import()` of each. Vite already code-splits per app chunk — this works today if we switch the import style.
- Routes for uninstalled apps redirect to a "not installed" page rather than 404, so links from other apps degrade gracefully.

### 3. Contracts for cross-app communication

Today, cross-app comms is implicit (shared `entities` FK, implicit URI resolution in `@pops/navigation`). Formalise as:

- **Typed contracts**: `packages/contracts/` defines versioned interfaces (e.g. `core.entity@1`, `finance.transaction@1`). Apps consume via tRPC calls only.
- **No cross-app imports at code level** (already enforced — keep enforcing).
- **Optional dependencies**: an app that _can_ link to an object type from another app (e.g. inventory item linked from a finance transaction note) must declare it as optional and degrade when that app is absent. The URI resolver ([ADR-012](../architecture/adr-012-universal-object-uri.md)) needs to tolerate missing resolvers.
- **FK hygiene**: cross-app FKs become nullable with `ON DELETE SET NULL`. No cascading deletes across app boundaries.

### 4. Database — the real cost

SQLite is one file, and today's FKs cross boundaries. Two sub-problems:

- **Install**: run that app's migrations against the shared DB. Each app owns a migration folder; `drizzle-kit` run scoped per app. The existing single-migrations model ([ADR-013](../architecture/adr-013-drizzle-orm.md)) needs to be sliced per app.
- **Uninstall**: what happens to the data?
  - _Soft uninstall_ (default): routes hidden, router unmounted, jobs stopped, data retained. Reinstall is instant.
  - _Hard uninstall_: export (JSON) → drop tables → null cross-refs. Needs a per-app export format and user confirmation.
  - Cross-app references (e.g. inventory items referenced from finance) must be scanned before hard uninstall. Show "this will break N links in finance" before proceeding.

### 5. Progressive add/remove UX

- New admin page: **Apps**. Lists installed apps, available-but-not-installed apps, and a button to install/uninstall.
- Install: runs migrations, seeds default settings, hot-registers the backend router, triggers shell manifest refresh.
- Uninstall: soft by default; "Remove data" is a separate destructive confirmation.
- Shell re-renders on manifest change without a full reload (React Router supports dynamic route trees; easier: reload on install/uninstall — fine for self-hosted single-user).

## Two tiers — ship in this order

1. **Tier 1 — Install-time selection** (low risk, high value):
   - A single `POPS_APPS=finance,inventory` env var at container start decides which apps are mounted.
   - Migrations run only for listed apps. Others' tables simply don't exist.
   - Changing the set requires a restart. Data retained if you re-enable.
   - Covers the "onboarding a new user with only finance" story.
2. **Tier 2 — Runtime install/uninstall** (builds on Tier 1):
   - Add `apps` table, admin UI, hot-register, hot-migrate, soft/hard uninstall.
   - The user's "progressive add/remove" requirement is fully met here.

Tier 1 is ~1 week. Tier 2 is 2–3 weeks after Tier 1 lands.

## Advantages

- Third-party installability — someone can run "just media" on their own server with no finance data model present
- Smaller install footprint when features aren't wanted (fewer tables, fewer env vars required, fewer cron jobs)
- Clearer architectural boundaries — contracts become explicit instead of implicit
- Enables independent app versioning later if we want
- Supports [deployment-split](./deployment-split-spike.md) — a split deploy repo can compose different POPS images for different hosts
- Pairs with [feature-toggles](./feature-toggles-spike.md) — modules are the coarse grain, toggles the fine grain

## Disadvantages / risks

- **Schema migrations get harder**: per-app migration folders, cross-app FK ordering, install/uninstall idempotency — real work
- **Cross-app features degrade**: universal search, URI resolver, the AI overlay (all of which expect every domain to be present) need to handle absent apps
- **More surface to test**: matrix of installed-app combinations grows quickly (2^4 = 16 today)
- **"Ego" naming drift**: you mentioned "ego" as an app — the codebase has `app-ai` (frontend) and a `cerebrum` backend module. We need to settle what the user-visible app is called and whether cerebrum's engrams belong to it or to core (see open questions)
- **Data gravity**: media owns the most schema — making it removable is a lot of work for what will probably always be installed on your server
- **Single SQLite file**: works fine for this model; if someone wants "totally separate databases per app" that's a bigger rethink (and probably not needed)

## Open questions

- **Ego / AI / cerebrum.** You wrote "everything but ego". The repo has `app-ai` (frontend: AI usage, prompt templates, rules, cache management, plus a settings redirect) and `cerebrum` (backend: engrams, templates, scopes). Are these the same thing in your head? Is "ego" a rename of the user-facing AI app, or a new fifth app? **This shapes the boundary work.**
- Should engrams (`cerebrum`) be **core** (shell-level, always present, like entities) or an **app** (removable)? Universal URIs, the AI overlay, and cross-domain context all lean on engrams — arguments for core.
- Are settings-per-app owned by the app (with the app's manifest registering them) or all in core?
- Does admin (user management, audit, system settings) live in the shell or become its own mini-app?
- Are we willing to enforce "no cross-app code imports" via a lint rule, not just convention?
- Is runtime add/remove (Tier 2) worth it now, or is Tier 1 + a documented reinstall procedure enough?

## Recommendation

Yes — this is worth doing, and the current architecture is already mostly aligned. Phase it:

1. Settle the ego/AI/cerebrum naming + boundary (blocker for the rest)
2. Formalise contracts and add the app manifest type
3. Ship Tier 1 (`POPS_APPS` env var, per-app migrations, registry-based composition)
4. Revisit Tier 2 once Tier 1 is stable — likely worth it for the clean UX but not urgent
5. Enforce "no cross-app imports" with an eslint/dependency-cruiser rule so the boundary stops being honour-system

## Next steps if we proceed

- Open an epic under theme `01-foundation` or a new `07-shell` theme: "Modular app runtime".
- PRDs: (1) app manifest + registry, (2) per-app migrations, (3) frontend dynamic load, (4) contracts package, (5) admin Apps page (Tier 2).
- Write an ADR superseding [ADR-002](../architecture/adr-002-shell-architecture.md) or extending [ADR-004](../architecture/adr-004-api-domain-modules.md) to lock in the registry model.
- Pre-work: clarify ego/cerebrum naming; audit cross-app FKs in `packages/db-types/src/schema/`.
