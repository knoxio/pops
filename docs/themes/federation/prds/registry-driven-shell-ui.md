# Registry-driven shell UI aggregation

> Theme: federation · Status: **Partial** (in-repo registry walk shipped; two FE pillars not yet on the wire — see [docs/ideas/registry-driven-shell-ui.md](../../../ideas/registry-driven-shell-ui.md))

## Purpose

The shell discovers every pillar's UI surface — app-rail entry (`nav`), routable pages (`pages`), and capture overlay — by walking the runtime registry, the same way it discovers `searchAdapters`, `aiTools`, `sinks`, and `settings`. No shell-side source file enumerates pillars by name except a single workspace bundle map that wires in-repo pillar ids to their statically-imported React bundles.

Adding an in-repo pillar is one entry in the bundle map. Registering an _external_ pillar at runtime (its code lives outside the shell's build) requires zero shell edits: the pillar advertises an `assetsBaseUrl` on its manifest and the shell lazy-`import()`s its ESM bundle at first navigation.

This replaces two former anti-patterns the pillar-isolation audit flagged as top-severity:

- A `KNOWN_FRONTEND_MANIFESTS` literal that statically imported eight pillar frontend manifests by name.
- A `registeredApps` literal that statically imported seven pillar `navConfig` exports by name, with array position dictating app-rail order.

Both failed the external-pillar test: a pillar registered at runtime was invisible to the shell because the shell never looked at the registry for its UI surface. The shell already participates in the registry as the first UI pillar on boot; it now consumes other pillars' UI dimensions the same way.

## Data model — manifest UI dimensions

Three optional blocks on `ManifestPayloadSchema` (`libs/sdk/src/manifest-schema/`), exported from `@pops/pillar-sdk/manifest-schema` alongside `SinkDescriptor` and `SettingsManifestDescriptor`. All are wire-shaped: no React references cross the wire. Descriptors are representable from a Rust/Go pillar (no TypeScript-only constructs).

### `NavConfigDescriptor` — app-rail entry

| Field      | Type                     | Rule                                                            |
| ---------- | ------------------------ | --------------------------------------------------------------- |
| `id`       | kebab-case identifier    | unique app id (`finance`, `media`, …)                           |
| `label`    | string (min 1)           | display name                                                    |
| `labelKey` | string (min 1)           | i18n key in the `navigation` namespace                          |
| `icon`     | kebab-case identifier    | wire form; resolves to a Lucide `IconName` shell-side           |
| `color`    | enum, optional           | `emerald \| indigo \| amber \| rose \| sky \| violet`           |
| `basePath` | string starting with `/` | app root path                                                   |
| `order`    | integer (**required**)   | app-rail order, ascending; ties break lexicographically by `id` |
| `items`    | `NavItemDescriptor[]`    | per-page nav entries                                            |

`NavItemDescriptor`: `path` (string, `''` for index), `label` (min 1), `labelKey`, `icon` (kebab-case). Strict — unknown keys rejected.

### `PageDescriptor` — routable page

| Field        | Type                  | Rule                                                     |
| ------------ | --------------------- | -------------------------------------------------------- |
| `path`       | string                | route path (`''`/index allowed)                          |
| `index`      | boolean, optional     | marks the index route                                    |
| `bundleSlot` | kebab-case identifier | the export the bundle resolver maps to a React component |

The descriptor names a `bundleSlot`, never a component reference. For in-repo pillars the slot is resolved through the workspace bundle map; for external pillars it is resolved against the remote bundle's `bundles` record.

### `assetsBaseUrl` — external-pillar bundle URL

`z.string().url()` — an absolute URL where an external pillar serves its single ESM entry. A relative URL is rejected at validation. In-repo pillars omit it (they resolve through the static bundle map).

### `captureOverlay` — capture-modal contribution (adjacent dimension)

`CaptureOverlayDescriptor` (`bundleSlot`, `order: int`, optional `hotkey`/`label`/`labelKey`) ships in the same schema. Owned by the capture-overlay PRD; documented here only because it travels the same registry walk and bundle-map seam.

## REST surface

No new endpoints. The dimensions ride the existing registry wire:

- A pillar declares `nav` / `pages` / `assetsBaseUrl` in its `ManifestPayload` and self-registers with the `registry` pillar on boot (`external-registry/register`).
- The registry snapshot schema (`libs/sdk/src/discovery/snapshot-schema.ts`) validates the **full** `ManifestPayloadSchema`, so `nav` / `pages` / `assetsBaseUrl` travel verbatim in `GET /external-registry/snapshot` and the SSE subscribe stream.
- The shell reads the snapshot through the same discovery client `discoverSettings()` / `discoverSearchAdapters()` use (`pillarRegistry()` / `PillarSnapshot`). No new fetcher.

## How the shell consumes it

```
PillarSnapshot[]  ──bootEntries()──▶  RegistryEntry[]  ──walkRegistry(map)──▶  FrontendManifest[]
   (live wire)                          (pillarId + optional               (mounted UI surface)
                                          assetsBaseUrl/nav/pages)
```

- **Workspace bundle map** (`pillars/shell/src/app/bundle-map.tsx`) — the single object literal enumerating in-repo pillar ids. Each entry carries the statically-imported `@pops/app-*` manifest, a `navOrder`, and (cerebrum only) `captureOverlayBundles`. Sparse orders: `finance=10, media=20, inventory=30, food=40, lists=50, cerebrum=60, ai=70, ego=+Infinity`.
- **`walkRegistry(entries, map, importer?)`** (`pillars/shell/src/app/installed-modules.ts`) — resolution per pillar id:
  - bundle-map hit → emit the in-repo workspace manifest (statically bundled);
  - bundle-map miss + `assetsBaseUrl` set → external pillar: synthesize a manifest whose routes lazy-`import()` the remote bundle;
  - bundle-map miss + no `assetsBaseUrl` → backend-only pillar, dropped silently.
- **`bootEntries(snapshot)`** projects the live snapshot to `RegistryEntry[]` (only `registered` pillars; carries `assetsBaseUrl`/`nav`/`pages` for external pillars).
- **`staticFloorEntries()`** is the never-brick floor: the bundle-map ids narrowed by the `@pops/module-registry` install shim, used when the registry is unreachable. `installedFrontendManifests()` walks this floor synchronously and is the source the manifest-validation and capture-overlay tests read.
- **App rail** (`pillars/shell/src/app/nav/registry.ts`) — `buildRegisteredAppsFromBundleMap()` walks the map, lifts each entry's `frontend.navConfig`, and sorts by `navOrder` ascending with a lexicographic `id` tiebreak. The live rail reads the boot-resolved set via `BootRegistryProvider`; the exported `registeredApps` constant is the offline floor the order-parity gate pins.

## External-pillar UI loading (shipped — Option A)

`pillars/shell/src/app/external-ui.tsx` implements the lazy-`import()` mechanism:

- The shell `import(/* @vite-ignore */ assetsBaseUrl)`s the pillar's single ESM entry. The bundle must export a `bundles` record keyed by the kebab-case `PageDescriptor.bundleSlot` ids; each value is a zero-required-prop React component.
- The nav rail comes off the wire (`NavConfigDescriptor` → `AppNavConfig`, icons degrading to a `Compass` fallback when unknown), so the rail renders synchronously at boot.
- Each remote page is `React.lazy` + `<Suspense>` + `<ErrorBoundary>`: a failed load (network error, missing slot, invalid bundle) renders a placeholder, never crashing the shell.
- `synthesizeExternalBundleEntry()` returns `null` when an asset URL is advertised but `nav` and `pages` are both absent (nothing to mount → treated as backend-only).
- A structurally broken external descriptor throws `ExternalUiLoadError`, which `walkRegistry` catches, logs once, and skips.

No bundler coupling, no Module Federation, no iframe. ADR-002 stands: the in-repo FE is still one static Vite SPA; this is a runtime dynamic import of a URL.

The two rejected alternatives (Module Federation; one iframe per pillar) and the case for picking ESM `import()` are recorded in [docs/ideas/registry-driven-shell-ui.md](../../../ideas/registry-driven-shell-ui.md) under "Alternatives considered", since the implementation already chose Option A.

## Rules

- **Two new optional UI dimensions.** `nav` and `pages` are optional. Backend-only pillars omit both; overlay-only pillars (`ego`) omit `nav` and contribute via the bundle map's `+Infinity` order. Existing manifests parse unchanged.
- **Manifest is the source of truth for ordering.** App-rail order derives from `nav.order` (ascending; ties broken lexicographically by `nav.id`). The shell carries no presentation ordering for any pillar.
- **Registry-driven discovery.** `installedFrontendManifests()` and the app rail both derive from a single walk over the snapshot (or the static floor offline). No static per-pillar named imports survive in `installed-modules.ts` or `nav/registry.ts`.
- **Bundle map is the only id enumeration.** `bundle-map.tsx` is the single shell file that names in-repo pillar ids. External pillars never appear in it.
- **`assetsBaseUrl` resolves through the runtime loader.** Absolute-URL validated at the schema; consumed by `external-ui.tsx` when a registered pillar id is absent from the bundle map.
- **Test override survives.** `__setInstalledFrontendManifestsOverride()` / `__resetInstalledFrontendManifestsOverride()` override the joined output, not a raw literal.

## Edge cases

| Case                                                                | Behaviour                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Registered pillar id absent from bundle map, no `assetsBaseUrl`     | Backend-only — dropped silently from the walk.                                                                         |
| Registered pillar id absent from bundle map, `assetsBaseUrl` set    | External pillar — UI synthesized; routes lazy-load the remote bundle behind an error boundary.                         |
| Two pillars declare the same `nav.order`                            | Stable secondary sort by `nav.id` (lexicographic).                                                                     |
| External descriptor advertises `assetsBaseUrl` but no `nav`/`pages` | `synthesizeExternalBundleEntry` returns `null`; treated as backend-only.                                               |
| External descriptor structurally broken                             | `ExternalUiLoadError` caught in `walkRegistry`; logged once, pillar skipped, shell does not crash.                     |
| External bundle missing the named `bundleSlot` at first navigation  | `loadRemoteComponent` rejects; the per-route `<ErrorBoundary>` renders the placeholder.                                |
| External nav `icon` not a known shell `IconName`                    | Degrades to a `Compass` fallback rather than failing the nav build.                                                    |
| A pillar omits `nav` entirely (`ego`)                               | Still in `installedFrontendManifests()` for its overlay surface; contributes no app-rail entry (sorts at `+Infinity`). |
| Registry snapshot empty (boot race / registry down)                 | Shell degrades to `staticFloorEntries()` — the in-repo bundle map narrowed by the install shim — so it never bricks.   |
| Bundle map entry whose package no longer exports `routes`           | `hasRoutes()` returns false; manifest filtered out of `installedAppManifests()`.                                       |

## Acceptance criteria

### Manifest schema

- [x] `ManifestPayloadSchema` carries optional `nav`, `pages`, `assetsBaseUrl`.
- [x] `NavConfigDescriptor` mirrors `AppNavConfig` (`id`, `label`, `labelKey`, kebab `icon`, optional `color` enum, `basePath` starting with `/`, `items[]`) plus a **required** `order: int`.
- [x] `NavItemDescriptor` mirrors `AppNavItem` (`path`, `label`, `labelKey`, `icon`).
- [x] `PageDescriptor` carries `path`, optional `index`, kebab `bundleSlot` — wire-shaped, no component refs.
- [x] `assetsBaseUrl` validated as an absolute URL (relative rejected).
- [x] `NavConfigDescriptor`, `NavItemDescriptor`, `PageDescriptor` exported from `@pops/pillar-sdk/manifest-schema`.
- [x] Schema tests cover: all three blocks omitted; valid `nav`+`pages`; empty `pages`; missing `order`; `basePath` not starting with `/`; unknown `color`; non-kebab `icon`; unknown field on nav/page (strict); page missing `bundleSlot`.
- [x] Validator reports `nav`/`pages` issues with the same diagnostic shape as `sinks`/`settings`.

### Per-pillar wire contributions

- [x] `finance` (order 10), `media` (20), `inventory` (30), `food` (40), `lists` (50) declare `nav` + `pages` on their wire manifest (`pillars/<id>/src/api/manifest.ts`).
- [ ] `cerebrum` declares `nav` + `pages` on its wire manifest. **Not built** — its manifest explicitly defers this ("Phase D"); cerebrum's UI reaches the shell via the static bundle map only. See the idea file.
- [ ] `ai` declares `nav` + `pages` on its wire manifest. **Not built** — `buildAiManifest` omits both; ai's UI reaches the shell via the static bundle map only. See the idea file.
- [x] `ego` (overlay-only) omits `nav` and `pages`; surfaces via the bundle map at `+Infinity` order.
- [x] Each contribution is a small, independent edit — no shared file edit across pillars.

### Shell registry walk

- [x] `installed-modules.ts` imports zero `@pops/app-*` / `@pops/overlay-*` named manifests; the `KNOWN_FRONTEND_MANIFESTS` literal is gone.
- [x] `nav/registry.ts` imports zero `@pops/app-*` `navConfig` by name; the `registeredApps` literal is gone (now derived).
- [x] A single workspace bundle map (`bundle-map.tsx`) is the only shell file enumerating in-repo pillar ids.
- [x] `installedFrontendManifests()` walks the registry snapshot (or static floor) and joins through the bundle map; backend-only pillars filtered out.
- [x] `installedAppManifests()` preserves `surfaces.includes('app') && hasRoutes()` semantics.
- [x] App rail derives from the walk, sorted by `nav.order` with a lexicographic `nav.id` tiebreak; display order `finance, media, inventory, food, lists, cerebrum, ai` preserved by the sparse scheme.
- [x] A registered id absent from the bundle map with no `assetsBaseUrl` is dropped without crashing.
- [x] The `__setInstalledFrontendManifestsOverride()` test surface still works against the joined output.

### Integration test + audit M7

- [x] An integration test (`pillars/shell/src/tests/synthetic-pillar.integration.test.tsx`) registers a synthetic pillar with `nav` + `pages` and asserts: app-rail entry at the `navOrder`-derived position; routing under its `basePath` renders the fixture; deregistering it removes nav + manifest with no source edit.
- [x] The same test exercises an external registry entry (no bundle-map entry, with `assetsBaseUrl`) mounting via the runtime loader.
- [x] `pillars/shell/src/tests/manifests.test.ts` (audit M7) derives its iteration from `installedFrontendManifests()` instead of per-pillar named imports.

### External-pillar UI loading (shipped, not deferred)

- [x] The shell resolves an external pillar's `PageDescriptor.bundleSlot` by lazy-`import()`ing the advertised `assetsBaseUrl` (Option A) — implemented in `external-ui.tsx`, not deferred.
- [x] Remote pages are wrapped in `React.lazy` + `<Suspense>` + `<ErrorBoundary>`; a failed load degrades to a placeholder.
- [x] Module Federation and iframe-per-pillar are rejected for in-repo use; the rationale is captured in the idea file.

### Quality gate

- [x] `pillars/shell` registry-walk, nav-registry, manifests, integration, installed-modules, and external-ui tests pass (127 tests).
- [x] `@pops/pillar-sdk` manifest-schema tests pass (nav/pages/assetsBaseUrl cases green; typecheck clean).

## Out of scope

- **Wiring cerebrum / ai onto the wire `nav`/`pages`.** Tracked in [docs/ideas/registry-driven-shell-ui.md](../../../ideas/registry-driven-shell-ui.md). Both pillars render today via the static bundle map; their absence from the wire only matters when they need to be discovered by a non-shell consumer or hosted out-of-repo.
- **Module Federation for the shell.** Rejected; the FE stays a monolithic Vite SPA for in-repo pillars.
- **Independent FE deploys per pillar.** Same reason.
- **Per-pillar UI theming / chrome** beyond app theme colour propagation.
- **Shared-deps / React-version-skew contract for remote bundles.** The loader assumes a compatible remote; a hardened import-map / SRI / CSP posture is future work in the idea file.
