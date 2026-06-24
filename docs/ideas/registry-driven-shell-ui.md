# Registry-driven shell UI — remaining work

Spin-off from the [registry-driven shell UI PRD](../themes/federation/prds/registry-driven-shell-ui/README.md). The in-repo registry walk, the manifest UI dimensions, and the external-pillar ESM loader all shipped. Two things remain unbuilt.

## 1. Put cerebrum and ai `nav` / `pages` on the wire

Five FE pillars declare `nav` + `pages` on their wire manifest (`finance`, `media`, `inventory`, `food`, `lists`). Two do not:

- **cerebrum** — `buildCerebrumManifest` ships `settings`, `features`, and `healthcheck` but no `nav`/`pages`. Its manifest comment defers them to the "FE-rewire slice (Phase D)". Cerebrum's UI (and its `ingest-form` capture overlay) reaches the shell only through the static `WORKSPACE_BUNDLE_MAP` entry.
- **ai** — `buildAiManifest` explicitly omits `nav`/`pages` ("like core"). The AI usage dashboard reaches the shell via the bundle map.

Both render correctly today because the shell resolves them through the static bundle map. The gap is only visible to a consumer that reads the UI surface off the wire (the registry snapshot), or if either pillar were ever hosted out-of-repo.

### Deliverable

- Add `NavConfigDescriptor` + `PageDescriptor[]` to `buildCerebrumManifest` (order `60`) and `buildAiManifest` (order `70`), sourcing the values from the matching `@pops/app-*` `navConfig` / route table to avoid duplication.
- Cerebrum additionally carries its capture overlay on the wire via `captureOverlay` (bundle slot `ingest-form`).

### Acceptance criteria

- [ ] `buildCerebrumManifest` declares `nav` (order 60) + `pages` matching `@pops/app-cerebrum`'s routes; the registry snapshot carries them.
- [ ] `buildAiManifest` declares `nav` (order 70) + `pages` matching `@pops/app-ai`'s routes.
- [ ] App-rail order is unchanged (`finance, media, inventory, food, lists, cerebrum, ai`) — sourced from the wire `order`, not the bundle-map `navOrder`, once both are populated.
- [ ] Manifest validator passes for both pillars; `bundleSlot` values match the bundle map's resolvable slots.
- [ ] The synthetic-pillar integration test (or a sibling) asserts cerebrum/ai mount from a wire-only snapshot with no bundle-map `navConfig` fallback.

## 2. Harden the external-pillar loader contract

`external-ui.tsx` ships the lazy-`import()` mechanism (Option A) and the integration test proves an external entry mounts. What is _not_ specified is the production-grade contract around it.

### Open questions

- **Shared-deps / React-version skew.** The shell on React 19 importing a pillar bundled against React 18 is undefined behaviour. Need an import-map or `externals` strategy that hoists React + the shared SDK, or an explicit "bundle your own twin" posture.
- **CSP / SRI.** Which origins the shell trusts for `import()`, whether subresource-integrity hashes are mandatory on the manifest, and how the error-boundary contract reads when a remote bundle throws.
- **Navigation continuity for the iframe variant** (if ever added) — deferred; not implemented.

### Acceptance criteria

- [ ] A shared-deps contract (import map vs externals vs bundled twin) is specced and the React-version-skew posture is pinned.
- [ ] CSP origin allowlist + optional SRI on `assetsBaseUrl` is specced; the loader honours it.
- [ ] A real external example pillar (the external-pillar example repo) ships a UI surface and smoke-tests the loader end-to-end.

## Alternatives considered (external-pillar UI loading)

The implementation chose **Option A — lazy `import()` of `assetsBaseUrl`**. The two rejected options, kept for the record:

| Option | Mechanism                                   | Why rejected                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B**  | Module Federation (Webpack 5 / Vite plugin) | Bundler-coupled; locks the shell and every external pillar to a federation toolchain; excludes non-JS pillars without a wrapper. The shared-deps win is narrow and can be modelled in A via import maps.                                                                                                          |
| **C**  | One iframe per external pillar              | Strong isolation, but cross-frame state sync is bespoke, navigation history is split-brain, theming continuity is hard, and the shell's modals/sidebars cannot reach into the frame. Reserve as an opt-in `uiLoader: 'iframe'` only for pillars that genuinely need a separate crash domain or non-React runtime. |

Option A won because it is the lowest-coupling fit for typed federation: the shell already owns the manifest contract, `assetsBaseUrl` is the natural URL handle, and a dynamic ESM import is one line at the bundle-map seam. It works for any pillar shipping an ESM entry, including a Rust pillar shipping a wasm-backed component, with no bundler lock-in.
