# US-02: Open the routing/registry surfaces to `PillarId`

> PRD: [PRD-256 — Two-tier pillar id](README.md)

## Description

As the nginx generator, I want my registry-fed surfaces typed as `PillarId` and unknown pillars to
**append** to the render rather than be rejected, so that a pillar the build never heard of can be
routed — while the docker upstream map and parent-pillar table keep their closed-union guard rails.

## Acceptance Criteria

- [x] The generator's registry/render-facing types (the pillar set derived from the snapshot, the render iteration) use `PillarId`. An unknown id flows through `renderNginxConfDynamic` without a type error or a runtime throw.
- [x] `PILLAR_UPSTREAMS: Record<KnownPillarId, {host,port}>` and `MODULE_PARENT_PILLAR` stay typed on `KnownPillarId` — a new `pillars/<x>/` without a `PILLAR_UPSTREAMS` entry is still a **compile error**.
- [x] Lookup of a known id's upstream goes through `isKnownPillarId`; an unknown id has no entry and resolves its upstream from the registry `baseUrl` (PRD-255's `resolveUpstreamForEntry` contract). The generator now consumes the SDK's exported `isKnownPillarId` (the private duplicate was removed).
- [x] `PILLAR_RENDER_ORDER` orders the known set; unknown ids render **after** it in a stable, deterministic order. `assertRenderOrderCoversAllPillars` still asserts coverage of the _known_ set only and does not fail on unknown ids.
- [x] The deterministic-render test covers a snapshot containing an unknown id and asserts a stable output (PRD-255's `plugin-fitness` / `plugin-z` dynamic tests). Output validity is asserted structurally (resolver + well-formed REST blocks); no `nginx -t` shell-out is added — the suite is hermetic and has no nginx binary, matching the existing render tests.
- [x] No `as any` / suppression; `pnpm typecheck` + the generator suite green.

## Notes

Composes with PRD-255: PRD-255 makes the unknown-id _routing_ work at runtime via the `baseUrl` path;
this US makes the _types_ honest so the routing code isn't fighting the compiler or leaning on casts.
Keep the unknown-id ordering deterministic (e.g. sort by id after the fixed known order) so the
drift-checked fallback render stays byte-stable.
