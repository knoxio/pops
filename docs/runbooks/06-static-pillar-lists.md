# 06 — Retire the static pillar lists (finish self-registration)

Parent: [`00-completion-overview.md`](./00-completion-overview.md). Tracked follow-up, **not a
lake-migration blocker**. The runtime core registry already supports self-registration (a pillar
registers with its manifest + heartbeats; discovery and the nginx `--dynamic` mode read the live
registry). But several **build-time static pillar enumerations** survive — a pillar dropped into the
network self-registers at runtime yet isn't in these hand-maintained lists until someone edits + regens.
This epic removes or single-sources them so the invariant holds end-to-end: **add a pillar → it just works,
no list edit.**

## The invariant

> A new pillar joins the network, self-registers (register + heartbeat with its `ModuleManifest`), and
> is discovered, routed, gated, and surfaced — with **zero hand edits to any pillar list** and no regen.

## Inventory (by runtime impact)

### Tier A — runtime-affecting (the real self-registration gap)

| Site                                                                                                                                            | What                                                                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-shell/nginx.conf` (shipped via `Dockerfile:122 COPY`) + `generate-nginx-conf.ts:65` `PILLAR_UPSTREAMS` / `:80` `PILLAR_RENDER_ORDER` | Prod ships the **static** rendered conf built from a hand-maintained `Record<KnownPillarId, {host,port}>`. A self-registering pillar gets **no route** until someone adds it here + regenerates. | Wire prod to the **dynamic registry-driven** nginx that already exists — `gen:nginx:dynamic` (`--dynamic`, renders from `core.registry.list`) + `watch-registry-and-reload-cli.ts` (re-render + `nginx -s reload` on registry change). The static conf becomes a fallback only. This is the high-value change. |

### Tier B — build-time type/codegen enumerations (single-source them)

| Site                                                                                                                           | What                                                                                        | Fix                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:15` `PILLARS` + `:25` `KnownPillarId`                                 | Hand-listed array → compile-time union. Pervasive (typing, nginx `Record` keys, watch CLI). | Can't be _runtime_ (TS types are compile-time), but **derive it from a single source** (filesystem discovery like `discoverPillars`, or codegen from the registry snapshot) so adding a `pillars/<x>/` regenerates it — no hand edit. Accept a `KnownPillarId = string` widening at the seams that genuinely need runtime-open pillars. |
| `packages/module-registry/src/generated.ts:13` `KNOWN_MODULES` / `:25` `MODULES` (from hand-listed `scripts/known-modules.ts`) | Build-time module list, still hand-maintained at the source script.                         | Generate `known-modules.ts` from filesystem discovery of `pillars/*/` manifests (it's already a generated→committed pattern; make the _source_ discovered, not hand-listed). NB: the **features registry (05) deliberately does NOT read this** — it reads the runtime registry.                                                        |

### Tier C — verify / likely fine

| Site                                                              | What                                                                                                             | Action                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `scripts/contract/pillar-list.ts` `discoverPillars()`             | Already **filesystem-derived** (`readdirSync` of `packages/*-contract` + `pillars/*/contract`), not hand-listed. | Keep — this is the target pattern. Just confirm no hardcoded fallback list hides in it. |
| `packages/navigation/src/types.ts`                                | Grep flagged a `'core'…'finance'…` style array — confirm whether it's a real pillar enumeration or unrelated.    | Investigate; fix or document.                                                           |
| `apps/pops-shell/src/tests/synthetic-pillar.integration.test.tsx` | Test fixture listing pillars.                                                                                    | Test-only; fine, or make it derive.                                                     |

## Verification (Done when)

| #   | Check                            | Signal                                                                                                                                                                                     |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1  | Prod nginx is registry-driven    | A pillar that self-registers (register + heartbeat) gets a `/<x>-api/` route **without** any code edit or image rebuild (dynamic render + reload). Demonstrate with a synthetic pillar.    |
| V2  | No hand-maintained pillar arrays | `PILLARS` / `KNOWN_MODULES` / `MODULES` are **generated from discovery**, not hand-edited; their source scripts read the filesystem/registry. CI verifies the generated output is in sync. |
| V3  | Add-a-pillar drill               | Scaffold a throwaway `pillars/zzz/`, boot it, confirm it registers, routes, and (if it declares features) surfaces in `features.list` — touching **zero** list files.                      |
| V4  | No regressions                   | `pnpm typecheck` + `lint:boundaries:verify` + the nginx drift gate green; the 7 real pillars still route.                                                                                  |

## Notes / gotchas

- **Tier A is the actual self-registration win** — the dynamic nginx already exists; this is wiring + an
  ops decision (the event-driven reload), not new invention. Do it first.
- **Tier B can't be fully runtime** (TypeScript + dep-cruiser are build-time). The goal is \*single-sourced
  - auto-derived\*, not "no list anywhere" — a generated list rebuilt from discovery satisfies the invariant
    (no hand edit) even though a build-time artifact exists.
- **`KnownPillarId` widening:** some call sites assert a closed set of 7 for exhaustiveness; opening it to
  runtime pillars means deciding where a `string` pillar id is acceptable vs. where the closed union earns
  its keep. Scope that per call site, don't blanket-widen.
- This is **independent of the features epic (05)** and of the lake migration's G1–G10 — features is already
  registry-driven by design. Sequence 06 whenever; it has no gate on the migration finishing.
