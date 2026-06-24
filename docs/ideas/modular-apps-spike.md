# Spike — POPS as a suite of modules on a shell

Investigation only — recommendations, no code changes. Sibling spike: [feature-toggles](./feature-toggles-spike.md).

Outcome: superseded by the **Modular Module Runtime** group in the [Foundation theme](../themes/foundation/README.md). The spike below describes the goal-state architecture; the [module-import-boundaries](../themes/foundation/prds/module-import-boundaries/README.md), [overlay-surfaces](../themes/foundation/prds/overlay-surfaces/README.md), and [plugin-contract](../themes/foundation/prds/plugin-contract/README.md) PRDs carry the implementation.

## Question

Restructure POPS so an operator can install **only** finance, **only** media, or "everything but ego". The shell (auth, user, admin, settings, navigation, shared UI) is always present. Each module owns its data, API, and surfaces. Cross-module communication goes through well-defined contracts. The set of installed modules is a runtime decision, not a compile-time one.

## Surface model — three categories

Three categories: **shell**, **app**, **overlay**.

Always present (the shell):

| Surface            | Provided by                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Auth, user, admin  | `apps/pops-api/src/modules/core/*`, `apps/pops-api/src/trpc.ts`, `apps/pops-api/src/middleware/cloudflare-jwt.ts` |
| Settings           | `apps/pops-shell/src/app/pages/SettingsPage.tsx`, `core/settings`                                                 |
| Navigation, search | `packages/navigation`, shell layout                                                                               |
| UI library         | `packages/ui`                                                                                                     |
| API client + types | `packages/api-client`, `packages/db-types` (core schema)                                                          |
| Shared entities    | `core/entities` ([ADR-005](../architecture/adr-005-shared-entities.md))                                           |

Optional page-routed modules (own navigation, pages, domain data):

| Module    | Tables owned                                                                                | Notes                                                                    |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| finance   | `transactions`, `budgets`, `wishlist`, `transaction_tag_rules`                              | Uses `entities` FK                                                       |
| media     | `movies`, `tv_shows`, `comparisons`, `watch_history`, `watchlist`, `rotation_*`, ~11 tables | Heaviest; external integrations (Plex, TMDB, TVDB, Arr)                  |
| inventory | `home_inventory`, `item_connections`, `item_documents`, `item_photos`, `locations`          | Uses `entities` FK                                                       |
| ai        | `ai_usage`, `ai_providers`, `ai_model_pricing`, `ai_inference_log`, `ai_budgets`            | AI ops admin surface                                                     |
| cerebrum  | `engrams`, `glia_*`, `nudges`, `plexus_*`, `reflex_*`                                       | One togglable unit; sub-modules share hard internal deps and ship as one |

Cerebrum is one togglable unit. Sub-modules (engrams, glia, nudges, plexus, reflex) have hard internal dependencies and ship together. Sub-toggles, where needed, are internal env flags rather than separate installable modules.

Optional overlays (installable, no dedicated `/path` — they surface through shell chrome):

| Overlay | Summons via                                 | Owns                                                                         |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| ego     | Floating panel + keyboard shortcut + chrome | Conversation state shared with `/cerebrum/chat`; settings at `/settings/ego` |

`ego` is naturally **dual-surface** — it has both a `/cerebrum/chat` page and a system-wide overlay. The manifest models this by letting one module declare multiple surfaces, not by forcing a single `kind`. Future overlays (e.g. graduated `search`) follow the same pattern.

## Module manifest

Each module exports a manifest. Surfaces are an array, not a single `kind` — supporting dual-surface modules cleanly.

```ts
// packages/app-finance/src/index.ts
export const manifest: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  surfaces: ['app'],
  frontend: { routes, navConfig, searchAdapters },
  backend: { router: financeRouter, jobs: [...] },
  schema: financeSchemas,
  dependsOn: ['core.entities'],
  provides: ['finance.transaction', 'finance.budget'],
  settings: financeSettingsManifest, // unified-settings SettingsManifest, plugged in as a slot
};

// packages/overlay-ego/src/index.ts
export const manifest: ModuleManifest = {
  id: 'ego',
  name: 'Ego',
  surfaces: ['overlay', 'app'], // dual-surface: chrome overlay + /cerebrum/chat
  frontend: {
    overlay: { component: EgoOverlay, chromeSlot: 'assistant', shortcut: 'mod+i' },
    routes,
    navConfig,
  },
  backend: { router: egoRouter, jobs: [...] },
  schema: egoSchemas,
  settings: egoSettingsManifest, // settings live at /settings/ego (already exists)
};
```

`SettingsManifest` ([unified-settings](../themes/foundation/prds/unified-settings/README.md)) plugs in as a `settings` slot inside `ModuleManifest`, not as a parallel concept.

## Backend modules — already siblings

`apps/pops-api/src/modules/` already splits `ego/` and `cerebrum/` as siblings. The frontend manifest must mirror this: ego is its own module with its own surfaces, not nested inside cerebrum.

Per-module migrations are deferred. `0038-0041` straddle cerebrum sub-modules; slicing them is cosmetic until there is a real driver. Hard-uninstall preflight (export → drop → null cross-refs) is also deferred — soft-by-default covers every current use case.

## Cross-module communication

- Cross-module imports are forbidden at code level, enforced by [module-import-boundaries](../themes/foundation/prds/module-import-boundaries/README.md) lint rules (not honour-system).
- Cross-module data references go through tRPC contracts; FKs that cross module boundaries are nullable with `ON DELETE SET NULL`.
- The URI resolver ([ADR-012](../architecture/adr-012-universal-object-uri.md)) and universal search degrade gracefully when a referenced module is absent.

## Tier 1 — env-driven runtime

`POPS_APPS=finance,inventory` and `POPS_OVERLAYS=ego` decide what mounts at boot:

- Backend tRPC root reads env, composes only listed modules' routers; migrations run only for listed modules.
- Frontend fetches `/api/shell/manifest` to learn which modules are installed, then dynamic-imports them. Vite already code-splits per workspace package — switching from static to dynamic imports preserves the split.
- Routes for absent modules redirect to a "not installed" page (not 404). Universal search and the URI resolver tolerate the gaps.
- Default (`POPS_APPS` unset) behaves identically to today.

Restart-on-change is acceptable; hot-register is not on the critical path.

Tier 2 (admin **Modules** page, install/remove from UI, hard-uninstall preflight) is deferred until there is a concrete driver.

## Advantages

- An operator can run "just finance" or "everything but ego" without code changes
- Smaller install footprint when features aren't wanted (fewer tables, fewer cron jobs, fewer required env vars)
- Cross-module boundaries become explicit and lint-enforced
- Pairs with [feature-toggles](./feature-toggles-spike.md): modules are coarse grain, toggles are fine grain
- A split-deploy repo can compose different POPS images for different hosts

## Disadvantages / risks

- **Cross-module features must degrade**: universal search, URI resolver, and the ego overlay (which expects every domain to be present for context) need missing-module handling
- **Test surface grows**: with N apps + M overlays, the install-set matrix grows quickly. Test only the sensible sets (everything; minimum viable; finance-only; cerebrum-absent), not the full matrix
- **Per-module migrations stay deferred**: existing migrations cross sub-module boundaries. Slicing them is real work and not yet needed
- **Single SQLite file**: works fine for this model. "Totally separate databases per module" is a bigger rethink that isn't on the table

## Recommendation

Yes. The relevant foundation PRDs:

1. **`module-import-boundaries`** — Cross-module import boundaries (lint). Ship first; honour-system is fragile.
2. **`plugin-contract`** (module manifest type) — Metadata-only contract; no runtime change. Prereq for the loader.
3. **`overlay-surfaces`** — Overlay surfaces + ego dual-surface. Extracts `packages/overlay-ego`, formalises overlay category.
4. **`plugin-contract`** (Tier 1 module runtime, `POPS_APPS` env loader) — Manifest-driven router composition + dynamic frontend imports + not-installed fallback.

Tier 2 (admin Modules page) and per-module migrations stay deferred.

## Closed questions

- **Cerebrum is one unit, not an umbrella of sibling modules.** Engrams, glia, nudges, plexus, reflex have hard internal dependencies and ship together.
- **Ego is dual-surface**, not a binary `app | overlay`. The manifest models surfaces as an array.
- **`packages/app-ai` keeps its name.** It is the AI operations admin surface; rename was cosmetic.
- **Per-module migration slicing is deferred** until a concrete driver appears.
- **Hard-uninstall preflight is deferred**. Soft-by-default covers current use cases.
