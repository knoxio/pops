# US-02: Each in-repo pillar declares `nav` and `pages` on its manifest

> PRD: [PRD-243 — Registry-driven shell UI aggregation](README.md)

## Description

As a pillar author, I want my pillar's manifest to carry its `nav` and `pages` contributions so the shell can mount my nav entry and routes from the registry walk, with no shell-side file naming my pillar.

## Acceptance Criteria

- [ ] Every in-repo pillar with a page-routed app declares a `nav` block on its manifest payload (`apps/pops-api/src/modules/<pillar>/index.ts`). Owners: `ai`, `cerebrum`, `finance`, `food`, `inventory`, `lists`, `media`.
- [ ] Each `nav` block carries the same `id`, `label`, `labelKey`, `icon`, optional `color`, `basePath`, and `items[]` values today's `navConfig` exports in the matching `@pops/app-<id>` package — sourced from there to avoid duplication.
- [ ] Each `nav` block carries an explicit `order: number` matching today's `registeredApps` array position in `apps/pops-shell/src/app/nav/registry.ts` (`finance: 1`, `media: 2`, `inventory: 3`, `food: 4`, `lists: 5`, `cerebrum: 6`, `ai: 7`). Order values may be sparse (10, 20, 30, …) so future pillars can slot in without renumbering.
- [ ] Every in-repo pillar with a page-routed app declares a `pages` block listing its route entries as `PageDescriptor[]`. The `bundleSlot` value identifies the export the workspace bundle map (US-03) resolves to the React component.
- [ ] `overlay-ego` and any other overlay-only pillar omits `nav` (no app-rail entry) and omits `pages` (no top-level routes). It continues to surface via its existing overlay manifest dimension.
- [ ] Each pillar's manifest contribution PR is small and independent — no shared file edit across pillars; mirrors the [PRD-240 US-03](../240-settings-as-manifest-dimension/us-03-pillar-manifest-contributions.md) shape.
- [ ] Manifest validator passes for each pillar.
- [ ] `pnpm --filter @pops/<pillar>-contract typecheck/test/build` is clean per pillar.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- US-02 is intentionally _adding_ the manifest contributions while leaving today's `navConfig` and frontend-manifest exports in `@pops/app-<id>` in place. The shell still imports them at this point; the registry walk (US-03) is the swap.
- The `nav.order` field is the explicit handover of presentation ordering from the shell to the manifest. Picking sparse integers (10, 20, …) at this US's commit point lets future external pillars register an order without forcing a renumber.
- For pillars that already have a `navConfig` export in their `@pops/app-<id>` package, the manifest values should be sourced from that export (or its constant predecessor) — keeping a single source of truth across this US and US-03's cleanup.
- A pillar that contributes _multiple_ nav entries (none today) would declare `nav` as an array. The schema in US-01 keeps `nav` singular for today's contributors; extending to an array is a follow-up.
