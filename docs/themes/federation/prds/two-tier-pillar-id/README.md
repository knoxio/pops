# Two-tier pillar id

> Theme: [federation](../../README.md)
>
> Status: Done

## Purpose

A pillar id must be expressible even when the build has never heard of it. Pillars
self-register with the `registry` pillar at runtime (federation / LAN registration),
so every routing, registry-snapshot, and navigation surface has to carry ids the
compiler was never compiled against. At the same time, a handful of in-tree surfaces
genuinely own a closed set of pillars — the nginx upstream port map and the shell's
default-route table — and a missing entry there _should_ fail the build.

The two-tier model keeps both honest:

- **Open tier** — `PillarId = string`. Used on every surface fed by the runtime
  registry. A registry-discovered pillar id flows through routing, snapshots, and
  nav without a compile error and without a runtime throw.
- **Curated value tier** — the `PILLARS` tuple (a _value_, not a closed type) plus
  the `isKnownPillarId(id)` guard. This is the runtime seam that tells "a pillar this
  build curates" apart from "an arbitrary registry id". Build-time surfaces that must
  enumerate the in-tree pillars (the docker upstream map, the render-order coverage
  assert) key off this value, not off a type.

The seam is a real runtime narrowing (`isKnownPillarId(id): id is KnownPillarId`),
never a cast. No `as any`, no `as unknown as`, no `eslint-disable`.

## Data Model

None. This is a type-and-call-site contract; there is no schema and no SQLite table.

## Type Surface

Exported from `@pops/pillar-sdk` (`libs/sdk/src/capabilities/`):

| Symbol                                             | Tier              | Role                                                                                                                                               |
| -------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type PillarId = string`                           | **open**          | Documented alias. The id type on every registry-fed surface: snapshots, routing/dispatch, nav/app-context.                                         |
| `type KnownPillarId = PillarId`                    | **open (alias)**  | A self-describing alias of `PillarId` (also `string`). Names call sites that _intend_ a curated pillar; resolves to `string`.                      |
| `type ModuleId = PillarId`                         | **open (alias)**  | Routable module id. Was a closed `pillars + {ego}` union; now `string`. Membership is a runtime question for `@pops/module-registry`.              |
| `const PILLARS` (readonly tuple)                   | **curated value** | The pillars baked into this build. A _value_, not the source of a closed type. Drives the runtime coverage assert and the `isKnownPillarId` guard. |
| `isKnownPillarId(id: string): id is KnownPillarId` | **the seam**      | Runtime guard: narrows an arbitrary string by membership of the `PILLARS` value. The only sanctioned narrowing — no casts.                         |

`PillarId` is intentionally a plain `string` alias, **not** a brand: runtime ids are
genuinely open and a brand would force a cast at every registry boundary, the opposite
of the goal. The discipline is _which surface uses which alias_, enforced by review and
the call-site contract below — not by a nominal type.

### The closed-union guard moved from the type to a local value-keyed literal

Federation collapsed the formerly-closed compile-time `KnownPillarId` union into
`string` — the registry is the sole source of truth for which pillars exist, so adding
a pillar (or registering one over the LAN) needs no type edit. The guard rail that a
new in-tree pillar must ship a docker port did **not** disappear; it relocated from the
SDK _type_ to a local literal in the nginx generator:

```ts
type BuildPillarId = (typeof PILLARS)[number];
export const PILLAR_UPSTREAMS: Record<BuildPillarId, { host: string; port: number }>;
```

`Record<BuildPillarId, …>` derives its keys from the curated `PILLARS` tuple, so a new
entry in `PILLARS` without a matching `PILLAR_UPSTREAMS` port still fails typecheck —
exactly the build-error the closed union used to provide, surviving the type-widening.

## REST Surface

None. No pillar contract route, no registry endpoint is added or changed by this
contract. The surfaces it governs are:

- The **registry snapshot** consumed by the nginx generator (`DiscoveredPillar` entries
  carry `pillarId: PillarId`, `baseUrl`).
- The **shell nav / app-context** (`AppContext.app: PillarId | null`).

## Routing surfaces (nginx generator)

`pillars/shell/scripts/generate-nginx-conf.ts` renders the shell's `nginx.conf` in two
modes off the same template:

- **Static** — keys off the curated `PILLARS` value + `PILLAR_UPSTREAMS`. Image-build
  time, reproducible without a live registry, guarded by a drift test.
- **Dynamic** (`--dynamic`) — reads the live registry snapshot via the SDK discovery
  transport and emits one `/<pillar>-api/` REST block per registered pillar, so a
  newly-registered external pillar picks up routing without a fresh shell image.

The registry/render-facing types are `PillarId`. The closed-set surfaces stay keyed on
the `BuildPillarId` literal:

- `PILLAR_UPSTREAMS: Record<BuildPillarId, {host,port}>` — canonical in-cluster
  `host:port` per curated pillar. Missing entry = compile error.
- `resolveUpstreamForEntry(entry)` — a curated pillar's docker `host:port` wins over the
  advertised `baseUrl` (a localhost registration during dev must not break docker-network
  routing). An **unknown** id has no `PILLAR_UPSTREAMS` entry and resolves its upstream
  by parsing `host:port` out of the registry `baseUrl`.
- `orderUpstreams(...)` — curated pillars first in `PILLAR_RENDER_ORDER`, then unknown
  ids appended in ascending `pillarId` order, so the rendered output is byte-stable.
- `assertRenderOrderCoversAllPillars()` — asserts `PILLAR_RENDER_ORDER` covers the
  **curated** set only; it never fails on an unknown id, and it also rejects a render-order
  entry that is not in `PILLARS`.

The generator consumes the SDK's exported `isKnownPillarId` semantics via `knownUpstream`
(a `Map` over `PILLAR_UPSTREAMS`); there is no private duplicate of the membership check.

## Navigation surface (shell)

`libs/navigation/src/types.ts`:

- `AppContext.app: PillarId | null` — the active app/nav surface accepts any
  registry-discovered pillar id, open by construction.
- `type AppName = 'finance' | 'food' | 'lists' | 'media' | 'inventory' | 'ai' | 'cerebrum'`
  — a **closed** union retained **only** where a finite known set genuinely earns it: the
  built-in default-route table `APP_BASE_PATHS` and the `detectApp(pathname)` path→app
  mapping in `AppContextProvider`. That mapping is an in-repo fact the build owns; it is
  not a gate on which pillars may surface in nav.
- `IconName` and the other unions in the file are untouched.

## Business Rules

- **Closed where a gap must fail the build.** The docker upstream map keys on the
  `BuildPillarId` literal derived from `PILLARS`; the default-route table keys on the
  `AppName` union. Adding an in-tree pillar without a port (or a path mapping) is a
  compile error — those are in-repo facts the build owns.
- **Open everywhere the registry feeds.** Anything sourced from the registry snapshot or
  a registration event is `PillarId`. The nginx render must **append** unknown pillars,
  never reject them. The coverage assert checks the _curated_ set only.
- **The seam is an explicit guard.** Narrowing an open id to the curated set goes through
  `isKnownPillarId` with a defined fallback (an unknown pillar has no `PILLAR_UPSTREAMS`
  entry, so its upstream comes from the registry `baseUrl`). No casts, no suppression.
- **No new hand-list.** This contract opens types and relies on the _single_ curated
  `PILLARS` value; it does not introduce a third pillar enumeration to maintain.

## Edge Cases

| Case                                                                 | Behaviour                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry returns an id not in `PILLARS`                              | Typed `PillarId`; routes via the registry `baseUrl`; surfaces in nav. No compile error, no runtime throw.                                         |
| A curated pillar id arrives from the registry                        | `knownUpstream` (the `isKnownPillarId` membership check) hits; the docker `host:port` from `PILLAR_UPSTREAMS` wins over the advertised `baseUrl`. |
| Someone adds `pillars/<x>/` to `PILLARS` but forgets its port        | Compile error on `Record<BuildPillarId, …>` — the guard rail survives the type-widening as a value-keyed literal.                                 |
| Unknown pillar advertises an invalid / hostless / portless `baseUrl` | `resolveUpstreamForEntry` throws a descriptive error rather than rendering a broken upstream.                                                     |
| Snapshot mixes curated + unknown ids                                 | `orderUpstreams` renders curated first (`PILLAR_RENDER_ORDER`), unknown appended alphabetically — byte-stable.                                    |
| A registry-discovered pillar is the active nav surface               | `AppContext.app` is `PillarId`, so it carries the unknown id; `detectApp` only maps the built-in base paths.                                      |

## Acceptance Criteria

### Open `PillarId` type and the curated seam

- [x] `@pops/pillar-sdk` exports `type PillarId = string` (a documented alias) and
      `type KnownPillarId` (an alias of `PillarId`); JSDoc states which surface each names.
- [x] `PILLARS` (readonly tuple value) and `isKnownPillarId(id: string): id is KnownPillarId`
      are exported; the guard narrows by membership of the `PILLARS` value.
- [x] The open path for unknown ids is the explicit string-router overload of `pillar()`
      (`pillar<TRouter>(pillarId: string)`), not an accidental widening.
- [x] The two-tier rule is documented in the SDK module docs (`known-pillar-id.ts`,
      `module-id.ts`): curated value on `PILLAR_UPSTREAMS` + the render coverage assert;
      open `PillarId` on registry/routing/nav.
- [x] No `as any`, `as unknown as`, or `eslint-disable`; narrowing to the curated set is
      only ever via `isKnownPillarId` / its `Map` form.
- [x] Repo-wide typecheck is green.

### Routing / registry surfaces typed open

- [x] The nginx generator's registry/render-facing types use `PillarId`; an unknown id
      flows through `renderNginxConfDynamic` without a type error or a runtime throw.
- [x] `PILLAR_UPSTREAMS` is `Record<BuildPillarId, {host,port}>` (keys derived from the
      curated `PILLARS` value) — a new curated pillar without a port is a compile error.
- [x] A curated id's upstream resolves through the membership check; an unknown id has no
      entry and resolves its upstream from the registry `baseUrl` (`resolveUpstreamForEntry`).
      The generator consumes the SDK membership semantics; no private duplicate.
- [x] `PILLAR_RENDER_ORDER` orders the curated set; unknown ids render after it in a stable,
      deterministic (alphabetical) order. `assertRenderOrderCoversAllPillars` asserts the
      curated set only and does not fail on unknown ids.
- [x] The deterministic-render test covers a snapshot containing an unknown id and asserts
      stable, well-formed output (resolver + REST blocks), hermetic with no `nginx -t` shell-out.

### Nav / app-context typed open

- [x] `libs/navigation/src/types.ts` types the active-app/nav-surface id (`AppContext.app`)
      as `PillarId | null`, not the closed `AppName` union.
- [x] The remaining closed `AppName` use is justified — kept only for the finite built-in
      default-route table (`APP_BASE_PATHS` / `detectApp` in `AppContextProvider`).
- [x] `IconName` and other unrelated unions in the file are untouched.
- [x] Repo-wide typecheck is green; the shell builds; no casts introduced at the nav boundary.

## Out of Scope

- **A nominal brand for pillar ids.** `PillarId` is a `string` alias; a brand is a separate,
  additive change if misuse becomes a real problem.
- **The registry-driven shell-UI rewrite.** Deleting the static frontend-manifest list and
  walking the registry for nav is a separate contract; this one only opens the _type_ so
  that walk can carry unknown ids.
- **Single-sourcing `PILLARS` from disk discovery.** Module membership is already
  disk-discovered in `@pops/module-registry`; the curated `PILLARS` value stays the
  build-time list of in-tree pillars. This contract opens the _types_ around it, it does
  not regenerate the value.
