# Epic 10: Frontend pillar SDK + dispatcher generator

> Theme: [Pillar finale](../README.md)

## Scope

Make the front-end registry-aware end-to-end. Three pieces:

1. **`@pops/pillar-sdk/react`** — React hooks against the live registry. `usePillar('media')`, `useUriResolver(uri)`, etc. Plus the `pillar()` SDK from Epic 05 wired through React Query for the shell.
2. **`PillarGuard` rewrite** — currently reads a static config; new version reads the live registry snapshot + subscribes to changes. A pillar going down → its guarded routes render the unavailable placeholder within the next snapshot refresh.
3. **nginx dispatcher generator** — the dispatcher's per-pillar regex blocks become generated from the registry. A new pillar registering → the dispatcher reloads with new rules. Either deploy-time (init container reads registry → writes nginx.conf → reloads) or runtime (sidecar that polls). Pick at PRD time.

## PRDs

| #   | PRD                                 | Summary                                                                                      | Status      |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| 215 | React SDK                           | `usePillar`, `useUriResolver`, `usePillarQuery`, `usePillarMutation` hooks                   | Not started |
| 216 | `PillarGuard` rewrite               | Reads live registry; subscribes to changes; per-route unavailable placeholders               | Not started |
| 217 | nginx config generator              | Generated `default.conf` from registry snapshot; init container OR sidecar strategy          | Not started |
| 218 | `@pops/module-registry` deprecation | The build-time registry becomes a thin wrapper around the runtime one (offline-dev fallback) | Not started |
| 227 | SDK consumer migration audit        | Punch list of every `trpc.*` consumer with its `pillar()` migration target + preconditions   | Not started |

## Dependencies

- **Requires:** Epic 02 (registry), Epic 05 (SDK), Epic 06 (search registry), Epic 07 (AI registry)
- **Unlocks:** Frictionless pillar add/remove from the FE's perspective; closes the loop on the "stop a container, it disappears from the UI" success criterion

## Out of Scope

- Module Federation (MFE) for the shell — explicit non-goal per the theme out-of-scope list. The FE stays monolithic SPA.
- Independent FE deploys per pillar — same reason
- Per-pillar UI theming or chrome — would be nice; not this theme
