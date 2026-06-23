# nginx config generator

> Theme: [Federation](../../README.md)

## Overview

The shell pillar (`pillars/shell`) fronts every other pillar through a single
nginx reverse proxy. Its `nginx.conf` carries one `location /<pillar>-api/`
dispatcher block per pillar, plus a fixed set of cross-cutting routes
(orchestrator search, media images, registry snapshot, SSE subscribe, docs,
SPA fallback).

Hand-maintaining one dispatcher block per pillar rots: every new pillar means
a manual edit, and a typo only surfaces at deploy time. This generator makes
the conf a **build artefact of a single source of truth** instead. One TS
renderer reads the curated pillar list and an upstream port map, emits the
full `nginx.conf` deterministically, and a drift test fails CI the moment the
committed file diverges from the generator output. Adding a pillar to the SDK
forces a port entry at typecheck time; the conf regenerates from there.

The same renderer also powers a **dynamic mode** that reads the live registry
snapshot instead of the compile-time list. That mode is what lets an external
pillar appear in routing with no shell rebuild — its runtime wiring (boot
render + event-reload watcher + production image) lives in the registry-driven
nginx and dynamic-pillar-registration PRDs and is cross-referenced below.

## Data Model

No persisted data. The generator produces one text artefact —
`pillars/shell/nginx.conf` — from two in-tree sources of truth and (in
dynamic mode) the registry snapshot.

| Source                             | Location                                           | Role                                                          |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Curated pillar list `PILLARS`      | `@pops/pillar-sdk`                                 | Which pillars exist (drives which `/<id>-api/` blocks render) |
| `PILLAR_UPSTREAMS`                 | `pillars/shell/scripts/generate-nginx-conf.ts`     | Per-pillar in-cluster `host:port` (`registry-api:3001`, …)    |
| `PILLAR_RENDER_ORDER`              | same file                                          | Stable block ordering so output is byte-stable                |
| Static fragments (HEAD/INTRO/TAIL) | `pillars/shell/scripts/nginx-conf-template.ts`     | Everything outside the per-pillar blocks                      |
| Orchestrator block                 | `pillars/shell/scripts/nginx-conf-orchestrator.ts` | The single `/orchestrator-api/` federated-search route        |
| Registry snapshot (dynamic only)   | registry pillar discovery transport                | Live pillar set for boot-render / event-reload                |

`PILLAR_UPSTREAMS` is typed `Record<BuildPillarId, { host; port }>` where
`BuildPillarId = (typeof PILLARS)[number]`. Keying on the curated value (not
the SDK's widened `KnownPillarId = string`) keeps the exhaustiveness guard
alive across the type-widening: a new pillar in `PILLARS` without a matching
port entry fails typecheck. Ports are asserted unique by the test suite.

## API Surface

### Renderer (pure functions, no I/O)

| Function                              | Mode    | Behaviour                                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `renderNginxConf(order?)`             | static  | `HEAD → REST_INTRO → per-pillar blocks → orchestrator → TAIL`, from the curated list        |
| `renderNginxConfFromUpstreams(u)`     | dynamic | Same shape from an explicit upstream list; empty input → conf with zero `/<id>-api/` blocks |
| `renderNginxConfDynamic(url, t?)`     | dynamic | Fetches the registry snapshot via the discovery transport, maps + orders, then renders      |
| `resolveUpstreamForEntry(entry)`      | dynamic | Known pillars keep their canonical docker `host:port`; unknown ones parse `baseUrl`         |
| `orderUpstreams(u)`                   | dynamic | Curated pillars first (in `PILLAR_RENDER_ORDER`), then unknown ones alphabetically          |
| `assertRenderOrderCoversAllPillars()` | both    | Defensive guard: render order ⊇/⊆ `PILLARS`, throws on a missing or extra id                |

Each per-pillar block strips the prefix and proxies via the variable form so
nginx defers DNS to request time (the shell boots even when a pillar container
is absent; the route 502s until the upstream is up):

```nginx
location /<pillar>-api/ {
    set $<pillar>_api_upstream http://<host>:<port>;
    rewrite ^/<pillar>-api/(.*)$ /$1 break;
    proxy_pass $<pillar>_api_upstream;
    include /etc/nginx/snippets/_pillar-proxy.conf;
}
```

The shared proxy directives (`proxy_http_version`, header forwarding,
timeouts) live once in `pillars/shell/nginx/conf.d/_pillar-proxy.conf` and are
`include`d by every block — installed into `/etc/nginx/snippets/` in the
image, never `conf.d/` (nginx auto-loads `conf.d/*.conf` as server blocks and
a bare partial there crashes boot).

### CLI

```sh
pnpm gen:nginx                      # static → writes pillars/shell/nginx.conf
pnpm gen:nginx:check                # static → exits 1 on drift (CI gate)
pnpm gen:nginx:dynamic              # dynamic → renders from the live registry
tsx scripts/generate-nginx-conf.ts --dynamic --out … --registry-url=http://registry-api:3001
```

The hand-written flag parser (`nginx-cli-args.ts`) accepts `--check`,
`--dynamic`, `--out[=]`, `--registry-url[=]`, and a positional output path.
`--check` with `--dynamic` is rejected (a live registry can't have stable
drift). The run loop (`nginx-cli-main.ts`) is split out so it can be
unit-tested without forking a subprocess. The registry URL resolves from
`POPS_REGISTRY_URL` (repo-wide convention), falling back to the legacy
`CORE_REGISTRY_URL`, then `http://registry-api:3001`.

### Validation

`pillars/shell/scripts/validate-nginx-conf.sh` runs `nginx -t` on the
committed conf + the partial inside `nginx:alpine`. It skips when Docker is
absent unless `REQUIRE_DOCKER=1`. Because the drift gate guarantees committed
== generator output, validating the committed conf transitively validates the
generator output.

## Business Rules

- **Deterministic.** Same source of truth → byte-identical output. Block order
  is pinned by `PILLAR_RENDER_ORDER`; dynamic mode sorts upstreams (curated
  first, then alphabetical).
- **Single source of truth.** `PILLARS` + `PILLAR_UPSTREAMS` drive every
  per-pillar block. Adding a pillar to the SDK without a port entry fails
  typecheck, not at deploy.
- **Committed conf == generator output, always.** `pnpm gen:nginx:check` runs
  in CI (`fe-quality.yml`). Any hand-edit that diverges fails the gate. The
  committed file doubles as the production **boot fallback**, so it ships in
  git on purpose — it is not a throwaway.
- **Variable-form `proxy_pass` everywhere.** Upstreams held in an nginx
  variable defer DNS to request time, so the shell boots even when an optional
  pillar container is missing. Every new upstream must adopt the same form.
- **No `/trpc` anywhere.** The monolith is retired; the generator emits zero
  `/trpc*` blocks and the test asserts the substring never appears.
- **Known pillars pin their docker upstream.** In dynamic mode a curated
  pillar keeps its `PILLAR_UPSTREAMS` `host:port` even if it registered with a
  `localhost`-shaped `baseUrl`, protecting in-cluster routing from dev drift.
  Unknown (external) pillars fall back to parsing `host:port` out of `baseUrl`.

## Edge Cases

| Case                                    | Behaviour                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| New pillar added to `PILLARS`, no port  | Typecheck fails (`Record<BuildPillarId, …>` is incomplete) before any conf is produced.          |
| Hand-edit to committed `nginx.conf`     | `pnpm gen:nginx:check` exits 1; CI fails until regenerated.                                      |
| `nginx -t` rejects the conf             | `validate-nginx-conf.sh` fails; the runtime entrypoint keeps the previous conf (registry PRD).   |
| Empty registry (dynamic mode)           | Renders HEAD + orchestrator + TAIL with zero `/<id>-api/` blocks — no monolith catch-all exists. |
| External pillar with invalid `baseUrl`  | `resolveUpstreamForEntry` throws with the offending pillar id (no host / bad port).              |
| Pillar container absent at request time | Route 502s; the shell itself stays up (variable-form `proxy_pass`).                              |

## Cross-cutting routes (TAIL)

Beyond the generated per-pillar blocks, the template emits a fixed set:
`/orchestrator-api/` (federated search), `/webhooks/up` → finance,
inventory document/photo byte routes, `/media/images/`, `/health` +
`/pillars` + `/pillars/health` + `/registry/subscribe` (SSE) → registry,
`/docs/` → the docs image, and the SPA `try_files` fallback. The registry
`/registry/{register,heartbeat,deregister}` surface is deliberately **not**
exposed publicly — registration runs entirely inside the docker bridge.

## Acceptance Criteria

- [x] `generate-nginx-conf.ts` reads `PILLARS` + `PILLAR_UPSTREAMS` and emits
      the full `nginx.conf` (static mode).
- [x] `PILLAR_UPSTREAMS` is `Record<BuildPillarId, …>`; a pillar without a port
      fails typecheck (exhaustiveness guard).
- [x] Output is deterministic — same source → identical bytes.
- [x] `pnpm gen:nginx` writes the conf; `pnpm gen:nginx:check` exits non-zero
      on drift.
- [x] Drift gate runs in CI (`fe-quality.yml` → `pnpm gen:nginx:check`), so a
      hand-edit that diverges from the generator fails the build.
- [x] Generator test suite covers drift, pillar coverage (every id has a unique
      port), render-output structure, determinism, and the defensive
      `assertRenderOrderCoversAllPillars()`.
- [x] No `/trpc*` blocks are emitted; the rendered conf contains no `trpc`
      substring.
- [x] Every per-pillar block strips its `/<id>-api` prefix and uses
      variable-form `proxy_pass` so the shell boots with a pillar absent.
- [x] Shared proxy directives are DRY via `_pillar-proxy.conf`, installed to
      `/etc/nginx/snippets/`.
- [x] `nginx -t` validation harness (`validate-nginx-conf.sh`) runs the
      committed conf + partial in `nginx:alpine`; `REQUIRE_DOCKER=1` makes the
      skip a hard failure.
- [x] Dynamic mode (`--dynamic`) renders one `/<id>-api/` block per registered
      pillar from the live registry snapshot; known pillars pin their docker
      upstream, unknown pillars parse `baseUrl`; empty snapshot renders zero
      per-pillar blocks.
- [x] Dynamic-mode tests run against an injected fake discovery transport — no
      live registry needed in the suite.

## Out of Scope

- **Runtime boot-render + event-reload + production image wiring.** The
  entrypoint that renders from the live registry on boot, the SSE-driven
  `nginx -s reload` watcher, the generator-health surface, and the esbuild
  bundling that ships these into the `nginx:alpine` image are the
  registry-driven nginx PRD's deliverables, built on this generator's dynamic
  mode. See the `prod-registry-driven-nginx` and
  `dynamic-pillar-registration` PRDs.
- **Per-host config overrides.** Single-host assumption.
- **TLS termination changes.**

## Status

**Done.** The static generator, drift gate, validation harness, and the full
test suite are shipped in `pillars/shell/scripts/`. The dynamic renderer is
shipped here too and is consumed by the runtime PRDs cross-referenced above.
