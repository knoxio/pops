# Spike — POPS as a suite of apps on a shell

Investigation only — recommendations, no code changes. Sibling spikes: [deployment-split](./deployment-split-spike.md), [feature-toggles](./feature-toggles-spike.md).

## Question

Restructure POPS so someone can install **only** finance, or **only** media, or "everything but ego", etc. The shell (auth, user, admin, settings, navigation, shared UI) is always present. Each app owns its data, API, and pages. Cross-app communication goes through well-defined contracts. **Apps can be added or removed progressively after install, not just at install time.**

## Current state — better than expected

The bones are already here:

- `apps/pops-shell/src/app/router.tsx:10-13` — shell statically imports four app packages (`@pops/app-finance`, `@pops/app-media`, `@pops/app-inventory`, `@pops/app-ai`) and mounts their exported routes
- `apps/pops-api/src/router.ts:24-30` — tRPC root manually composes per-domain routers (`finance`, `media`, `inventory`, `cerebrum`, `core`)
- `packages/app-*` — each app is a proper workspace package with its own `src/index.ts`, routes, pages, store. Research confirms **no app imports another app** — apps import shared workspace packages (`@pops/ui`, `@pops/api-client`, `@pops/navigation`, `@pops/db-types`, `@pops/types`, etc.) and external libraries as needed
- [ADR-002](../architecture/adr-002-shell-architecture.md) explicitly states "apps import from `@pops/ui` and shared packages, never from other apps. Cross-app communication goes through the API or shared stores"
- [ADR-004](../architecture/adr-004-api-domain-modules.md) limits backend modules to importing from `core/` only
- `@pops/navigation` already uses a **side-effect registry** (`registerResultComponent`) for search result components; backend search adapters are a separate registry (`registerSearchAdapter`) in `apps/pops-api/src/modules/core/search` — the seed of the right pattern

So the architecture is already close. The remaining work is to make app presence a runtime decision instead of a compile-time one, and to formalise contracts.

## The shell / app / overlay boundary

Three categories, not two. This falls out of the ego question — ego is not a page-routed app, it's a system-wide overlay (like search) that is still installable/removable.

Always present (the "shell"):

| Surface            | Provided by                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Auth, user, admin  | `apps/pops-api/src/modules/core/*`, `apps/pops-api/src/trpc.ts`, `apps/pops-api/src/middleware/cloudflare-jwt.ts` |
| Settings           | `apps/pops-shell/src/app/pages/SettingsPage.tsx`, `core/settings`                                                 |
| Navigation, search | `packages/navigation`, shell layout                                                                               |
| UI library         | `packages/ui`                                                                                                     |
| API client + types | `packages/api-client`, `packages/db-types` (core schema)                                                          |
| Shared entities    | `core/entities` ([ADR-005](../architecture/adr-005-shared-entities.md))                                           |

Optional page-routed apps (own navigation, pages, domain data):

| App                 | Tables owned                                                                                | Notes                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| finance             | `transactions`, `budgets`, `wishlist`, `transaction_tag_rules`                              | Uses `entities` FK                                                  |
| media               | `movies`, `tv_shows`, `comparisons`, `watch_history`, `watchlist`, `rotation_*`, ~11 tables | Heaviest; external integrations (Plex, TMDB, TVDB, Arr)             |
| inventory           | `home_inventory`, `item_connections`, `item_documents`, `item_photos`, `locations`          | Uses `entities` FK                                                  |
| ai-admin (`app-ai`) | `ai_usage`, `ai_providers`, `ai_model_pricing`, `ai_inference_log`, `ai_budgets`            | Admin surface for AI providers + usage; under the cerebrum umbrella |
| engrams             | `engrams`, `debrief_*`, knowledge/notes schema                                              | Notion-like notes/knowledge app; under the cerebrum umbrella        |
| _(future)_          | _(more under cerebrum)_                                                                     | Cerebrum is an umbrella theme, not a single app                     |

Optional overlays (installable/removable, but no dedicated navigation space — they surface through shell chrome):

| Overlay | Summoned from                                              | Owns                                                                    |
| ------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| search  | Top-bar icon + keyboard shortcut                           | Search adapters, recent-searches state (currently built into the shell) |
| ego     | Floating assistant across every page (like a chat overlay) | Conversation history, persona/memory config, AI overlay session state   |

Both categories are _installable_ — they register their routers, migrations, settings, and (for apps) routes. Overlays differ only in how they surface: no dedicated `/path` in the router, instead they hook into shell chrome via a registry. Today search lives inside the shell; under this model it graduates to a first-class overlay module, making ego a sibling rather than a special case.

## What has to change

### 1. Module manifest

Each module (app or overlay) exports a manifest instead of bare `routes` + `navConfig`:

```ts
// packages/app-finance/src/index.ts
export const manifest: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  kind: 'app',                    // 'app' | 'overlay'
  frontend: { routes, navConfig, searchAdapters },
  backend: { router: financeRouter, jobs: [...] },
  schema: financeSchemas,        // drizzle tables owned by this module
  migrations: './migrations',     // module-owned migrations
  dependsOn: ['core.entities'],   // contracts consumed
  provides: ['finance.transaction', 'finance.budget'],
  settings: financeSettingsManifest,
  onInstall: async (db) => {...}, // first-install side effects
  onUninstall: async (db, opts) => {...}, // opts.mode: 'soft' | 'hard'
};

// packages/overlay-ego/src/index.ts
export const manifest: ModuleManifest = {
  id: 'ego',
  name: 'Ego',
  kind: 'overlay',
  frontend: {
    chromeSlot: 'assistant',     // where in shell chrome it mounts
    component: EgoOverlay,
    settingsRoute: '/settings/ego',
  },
  backend: { router: egoRouter, jobs: [...] },
  schema: egoSchemas,             // owns conversation + memory tables
  // ...
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

Restart-on-change is acceptable, so neither tier needs hot-register/hot-migrate. The difference is how the set of installed modules is _declared_.

1. **Tier 1 — Declarative via env** (low risk, ~1 week):
   - `POPS_APPS=finance,inventory,engrams` + `POPS_OVERLAYS=search,ego` at container start decide what gets mounted.
   - Migrations run only for listed modules on boot.
   - Changing the set requires a container restart. Default is soft: stopping a module keeps its tables and data intact.
   - Covers the "third-party installs only finance" story via the operator's env file.
2. **Tier 2 — Admin-UI driven (still restart to apply)** (~2 weeks after Tier 1):
   - Admin **Modules** page lists installed, available, and removed modules.
   - Install / soft-remove writes to an `installed_modules` table and prompts a restart (or triggers one for self-hosted).
   - **Hard-remove** is a separate destructive action with a preflight:
     - Scan cross-module FKs, show "this will null N links in finance, M in inventory" before confirming.
     - Export the module's tables to JSON/SQL backup under `data/exports/<module>/<timestamp>/`.
     - Drop tables in a transaction, null cross-refs, remove from `installed_modules`.
   - Soft remains the default everywhere; hard is opt-in and gated behind a typed confirmation.

## Advantages

- Third-party installability — someone can run "just media" on their own server with no finance data model present
- Smaller install footprint when features aren't wanted (fewer tables, fewer env vars required, fewer cron jobs)
- Clearer architectural boundaries — contracts become explicit instead of implicit
- Enables independent app versioning later if we want
- Supports [deployment-split](./deployment-split-spike.md) — a split deploy repo can compose different POPS images for different hosts
- Pairs with [feature-toggles](./feature-toggles-spike.md) — modules are the coarse grain, toggles the fine grain

## Disadvantages / risks

- **Schema migrations get harder**: per-module migration folders, cross-module FK ordering, install/uninstall idempotency — real work
- **Cross-module features degrade**: universal search, URI resolver, the ego overlay (all of which expect every domain to be present) need to handle absent modules
- **More surface to test**: matrix of installed-module combinations grows fast. With 4 apps + 2 overlays that's 64 possible sets; test the sensible ones (everything, minimum viable, each-alone) not the full matrix
- **Data gravity**: media owns the most schema — making it removable is a lot of work for what will probably always be installed on your server
- **Single SQLite file**: works fine for this model; if someone wants "totally separate databases per module" that's a bigger rethink (and probably not needed)

## Resolved

- **Cerebrum is an umbrella theme, not an app.** Under it sit independently installable modules: `ego` (overlay), `engrams` (app — Notion-like knowledge/notes), `ai-admin` (app — the current `app-ai`: usage, prompts, rules, cache), and more to come.
- **Ego is an overlay, not a page-routed app.** It behaves like an app (installable/removable, has settings, owns its data) but surfaces as a system-wide overlay like search. This justifies the `kind: 'overlay'` distinction in the manifest.
- **Audience is both** — architectural hygiene for the current server AND third-party installability. Design contracts and manifests tight enough that `git clone && docker compose up` with `POPS_APPS=finance` produces a working single-app install.
- **Restart-on-change is acceptable**, so hot-register is not on the critical path. Soft-remove is the default; hard-remove is a separately-gated destructive action.

## Still open

- Are per-module settings owned by the module (manifest registers them) or all in core? Manifest-owned feels right; revisit when the feature-toggle framework lands.
- Does admin (user management, audit, system settings) live in the shell or become its own mini-app? Lean shell for now.
- Are we willing to enforce "no cross-module code imports" via a lint rule (eslint-plugin-boundaries or dependency-cruiser), not just convention?
- Where does `packages/app-ai` rename land? To `packages/app-ai-admin` (clearer) or stay `app-ai` with an updated description?
- Does `packages/navigation` stay shell-level (search coexists with `ego` there) or split into `packages/overlay-search` + `packages/overlay-ego` once overlays are a formal category?

## Recommendation

Yes. Sequence:

1. Formalise the manifest + `kind: 'app' | 'overlay'` distinction
2. Graduate `search` from shell-internal to a first-class overlay (no behaviour change, just the shape we want)
3. Add the contracts package and the per-module migration layout
4. Ship Tier 1 (`POPS_APPS` / `POPS_OVERLAYS` env, per-module migrations, registry-based composition)
5. Build the admin **Modules** page with soft-install/remove + destructive hard-remove with preflight scan (Tier 2)
6. Enforce "no cross-module imports" with a lint rule so the boundary stops being honour-system
7. In parallel, start the split under the cerebrum umbrella: extract `engrams` as its own app, rename/repurpose `app-ai` → ai-admin, scaffold `overlay-ego`

## Next steps if we proceed

- Open an epic under a new `07-shell` theme (or extend `01-foundation`): "Modular module runtime".
- PRDs: (1) manifest + registry, (2) per-module migrations, (3) frontend dynamic load, (4) contracts package, (5) admin Modules page incl. hard-remove preflight, (6) overlay category + ego scaffold, (7) engrams app extraction.
- Write an ADR extending [ADR-002](../architecture/adr-002-shell-architecture.md) / [ADR-004](../architecture/adr-004-api-domain-modules.md) to lock in app-vs-overlay + the registry model.
- Pre-work: audit cross-module FKs in `packages/db-types/src/schema/`, scope the split of `cerebrum` backend module into ego + engrams + ai-admin backends.
