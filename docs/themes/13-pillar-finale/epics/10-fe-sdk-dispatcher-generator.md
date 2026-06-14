# Epic 10: Frontend pillar SDK + dispatcher generator

> Theme: [Pillar finale](../README.md)

## Scope

Make the front-end registry-aware end-to-end. Three pieces:

1. **`@pops/pillar-sdk/react`** — React hooks against the live registry. `usePillar('media')`, `useUriResolver(uri)`, etc. Plus the `pillar()` SDK from Epic 05 wired through React Query for the shell.
2. **`PillarGuard` rewrite** — currently reads a static config; new version reads the live registry snapshot + subscribes to changes. A pillar going down → its guarded routes render the unavailable placeholder within the next snapshot refresh.
3. **nginx dispatcher generator** — the dispatcher's per-pillar regex blocks become generated from the registry. A new pillar registering → the dispatcher reloads with new rules. Either deploy-time (init container reads registry → writes nginx.conf → reloads) or runtime (sidecar that polls). Pick at PRD time.

## PRDs

| #   | PRD                                   | Summary                                                                                                                                                                                                      | Status                                                                                            |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 215 | React SDK                             | `usePillar`, `useUriResolver`, `usePillarQuery`, `usePillarMutation` hooks                                                                                                                                   | Partial                                                                                           |
| 216 | `PillarGuard` rewrite                 | Reads live registry; subscribes to changes; per-route unavailable placeholders                                                                                                                               | Partial                                                                                           |
| 217 | nginx config generator                | Generated `default.conf` from registry snapshot; init container OR sidecar strategy                                                                                                                          | Not started                                                                                       |
| 218 | `@pops/module-registry` deprecation   | The build-time registry becomes a thin wrapper around the runtime one (offline-dev fallback)                                                                                                                 | Not started                                                                                       |
| 227 | SDK consumer migration audit          | Punch list of every `trpc.*` consumer with its `pillar()` migration target + preconditions                                                                                                                   | Not started                                                                                       |
| 238 | Settings-imports off module-registry  | Migrate the 8 `apps/pops-api` sites still importing per-pillar `SettingsManifest` from `@pops/module-registry/settings`                                                                                      | Partial — US-01 done; US-02 closes via PRD-240 US-05                                              |
| 239 | Settings-manifest physical relocation | Move the 10 manifests out of `@pops/module-registry/src/settings` into per-pillar contract packages; repoint `@pops/pillar-sdk/settings`; close PRD-238 US-02                                                | In progress — US-01 / US-03 / US-04 / US-05 done; US-02 in flight; US-06 folds into PRD-240 US-05 |
| 240 | Settings as a manifest dimension      | Promote settings to a first-class manifest dimension peer of `searchAdapters` / `aiTools` / `sinks`; replace the static SDK barrel with `discoverSettings()`; closes PRD-238 US-02 + PRD-239 US-06 (ADR-037) | Not started                                                                                       |
| 241 | Registry-driven `known-modules`       | Replace `MANIFEST_SOURCES` literal in `packages/module-registry/scripts/known-modules.ts` with workspace discovery over `@pops/*-contract` packages; closes audit H1; strict predecessor to PRD-218          | Not started                                                                                       |
| 242 | Dynamic `AppRouter` composition       | Replace the hand-curated `KNOWN_ROUTERS` literal in `apps/pops-api/src/router.ts` with a workspace-scan codegen catalogue + runtime `mergeRouters` over PRD-228 externals; closes pillar-isolation audit H3  | Not started                                                                                       |
| 243 | Registry-driven shell UI aggregation  | Replace shell's hand-curated `installed-modules.ts` + `nav/registry.ts` with a registry walk; add `nav` / `pages` / `assetsBaseUrl` manifest dimensions; closes audit H4 + H5 + M7                           | Not started                                                                                       |
| 244 | Cross-pillar SDK surface              | Unblock `app-ai` (14 sites) + `app-finance` batch 2 (23 sites) using `pillar('core').*` (Option A); post-mortem decides whether `crossPillarQuery` (Option B) ships in a successor PRD                       | Not started                                                                                       |

## Dependencies

- **Requires:** Epic 02 (registry), Epic 05 (SDK), Epic 06 (search registry), Epic 07 (AI registry)
- **Unlocks:** Frictionless pillar add/remove from the FE's perspective; closes the loop on the "stop a container, it disappears from the UI" success criterion

## Out of Scope

- Module Federation (MFE) for the shell — explicit non-goal per the theme out-of-scope list. The FE stays monolithic SPA.
- Independent FE deploys per pillar — same reason
- Per-pillar UI theming or chrome — would be nice; not this theme
