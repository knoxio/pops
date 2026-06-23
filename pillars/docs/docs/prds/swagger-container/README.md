# Swagger Container

> Parent: [Docs overview](../../README.md)

## Purpose

A tiny static container (`pops-docs`) serving a [Stoplight Elements](https://stoplight.io/open-source/elements) multi-spec browser pointed at every pillar's committed OpenAPI snapshot. Reachable at `/docs/` through the shell. It gives every developer (and future iOS / CLI / MCP integrator) a live, navigable view of every pillar's full API surface — endpoints, schemas, request builder, per-spec search — without grep'ing the codebase or running a pillar.

The cost is small (a few static files plus an `nginx:alpine` image); the operational value compounds fast, since debugging an unfamiliar pillar's API becomes a browse rather than a code dive.

## Data model

The only generated artefact is `catalog.json`, produced at image build time:

```jsonc
{
  "generatedAt": "<git-commit-sha or ISO timestamp>",
  "contracts": [
    {
      "id": "finance",
      "name": "Finance",
      "version": "1.4.2",
      "openapiPath": "/openapi/finance.json",
      "registryPillarId": "finance",
      "contractTag": "contract-finance@v1.4.2",
    },
    // ...one entry per pillar that ships an OpenAPI snapshot
  ],
}
```

Field derivation, per contract:

- `name` — `info.title` from the OpenAPI snapshot when present and non-blank, else the capitalised pillar id.
- `version` — `info.version` from the snapshot when present and non-blank, else the pillar's `package.json` version (or `0.0.0` for Rust pillars with neither).
- `openapiPath` — always `/openapi/<id>.json`.
- `registryPillarId` — the pillar directory id.
- `contractTag` — `contract-<id>@v<version>`.
- `generatedAt` — the repo's `git rev-parse HEAD` when built inside a checkout, else an ISO timestamp (so a build from a release tarball without `.git` still works).

The catalog drives the browser's navigation; the spec files it references are copied verbatim from each pillar.

## REST API surface

Served by the pillar's own `nginx`; the shell proxies `/docs/` to `pops-docs:80` with the prefix stripped, so these paths are served at their natural roots:

| Method | Path                 | Response                                                             |
| ------ | -------------------- | -------------------------------------------------------------------- |
| GET    | `/`                  | `index.html` — bootstraps Stoplight Elements against `/catalog.json` |
| GET    | `/catalog.json`      | The build-time catalog (`Cache-Control: no-store`)                   |
| GET    | `/openapi/<id>.json` | One pillar's OpenAPI spec (`Cache-Control: public, max-age=300`)     |
| GET    | `/healthz`           | `{"ok":true}` — compose / Watchtower healthcheck                     |

Entirely static. No registry call, no pillar call, no database. The specs served were generated and committed by each pillar; the docs build copies them into the image.

## Rules

- **Stoplight Elements is the renderer.** Loaded as a pinned CDN script tag (`@stoplight/elements@9.0.6`) in `index.html` — no bundler. The pin protects against upstream API drift; upgrades are explicit PRs.
- **Auto-discovery, no manual catalog.** `collect-specs.ts` walks `pillars/*`; any pillar with `openapi/<id>.openapi.json` appears automatically on the next image build. Discovery keys off the pillar directory and the presence of its OpenAPI file — there is no `-contract` package suffix.
- **Pillar package metadata is optional.** Rust pillars (e.g. `contacts`) ship a `Cargo.toml` and no `package.json`; their catalog entry sources name/version from the OpenAPI `info` block.
- **Build-time snapshot, not runtime.** The catalog reflects the contracts committed when the image was built. A redeploy refreshes it. Acceptable because contracts only change in PRs that already rebuild the image.
- **No runtime dependency on any pillar or on `registry`.** Pure static; the docs surface stays up even when every pillar is down.
- **Single vs multi.** One contract → a single `elements-api` view. Many → a left-hand pillar switcher driving an `elements-api` stage; internal operations are hidden (`hideInternal`).
- **Theming matches the shell.** A small `styles.css` overrides Elements' defaults — dark mode default, shell accent colour.
- **Local preview.** `pnpm dev` runs the collector once, watches every `pillars/<id>/openapi/` directory, debounce-recollects on change, and serves `dist/` over a built-in Node http server (default port 4280) with the same URL layout as prod.

## Edge cases

| Case                                                            | Behaviour                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A pillar has no `openapi/<id>.openapi.json`                     | Skipped silently; no catalog entry, not an error.                                                            |
| No pillars ship a snapshot (or `pillars/` is missing)           | Build warns and emits an empty catalog rather than throwing; the browser shows an empty-state message.       |
| Two specs share the same `info.title`                           | The pillar directory id is the canonical key; the title is only a label — no collision.                      |
| A pillar deleted in a PR but whose spec lingers in an old image | The next build only emits entries for pillars that exist; deletion drops the spec on rebuild.                |
| Catalog fetch fails in the browser                              | The page renders an inline error message with the failure reason; nginx still serves `/healthz`.             |
| Docs container is down                                          | The shell's variable-form `proxy_pass` lets the shell still boot; `/docs/` 502s. Nothing else depends on it. |
| 30+ contracts                                                   | The switcher list scrolls; no UX degradation.                                                                |
| A consumer wants the catalog programmatically                   | `/catalog.json` is a stable JSON endpoint, fetchable by CI / tooling.                                        |

## Acceptance criteria

- [x] `collect-specs.ts` discovers every `pillars/<id>` shipping `openapi/<id>.openapi.json`, copies each to `dist/openapi/<id>.json`, and emits one catalog entry per pillar (sorted by id).
- [x] The catalog covers all nine snapshot-shipping pillars (`ai`, `cerebrum`, `contacts`, `finance`, `food`, `inventory`, `lists`, `media`, `registry`), each with `openapiPath` `/openapi/<id>.json`, `registryPillarId` `<id>`, and a `contractTag` matching `^contract-<id>@v`.
- [x] `name` falls back to the capitalised id when `info.title` is blank; `version` falls back to the `package.json` version when `info.version` is blank.
- [x] `generatedAt` is the git commit sha inside a checkout, otherwise an ISO timestamp.
- [x] A missing `pillars/` directory degrades to an empty catalog with a warning, not a crash.
- [x] `dist/` also contains the copied `index.html` and `styles.css` after a build.
- [x] `index.html` fetches `/catalog.json`, renders a single `elements-api` for one contract, and a nav-driven `elements-api` stage for many; empty and error states render inline messages.
- [x] nginx serves `/` (SPA fallback), `/catalog.json` (no-store), `/openapi/<id>.json` (5-min cache), and `/healthz` (`{"ok":true}`).
- [x] The shell proxies `/docs/` to `pops-docs:80` with the prefix stripped, and still boots when `pops-docs` is absent.
- [x] The Dockerfile builds `dist/` with `pnpm build`, then copies it plus `nginx/default.conf` into an `nginx:alpine` image with a `/healthz` HEALTHCHECK.
- [x] `pnpm dev` collects once, watches each `pillars/<id>/openapi/` directory, debounce-recollects on change, and serves `dist/` locally with a `/healthz` route.

## Out of scope

- Per-contract authentication — the docs are public to anyone who can reach the shell; sensitive operations remain JWT-gated at the runtime pillar layer.
- Try-It-Out execution against live pillars (needs CORS + auth).
- Cross-spec search — Elements searches within one spec at a time.
- Long-form prose docs alongside the specs — specs only; prose stays in each pillar's `docs/`.
- Versioned docs (browsing prior contract versions) — only the committed current versions are surfaced.
- iOS app rendering this UI — the app reads the committed OpenAPI via Swift codegen; this container is a complementary human surface.
