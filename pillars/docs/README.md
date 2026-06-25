# @pops/docs

The **docs** pillar — a single navigable view of every other pillar's API
surface. It serves [Stoplight Elements](https://stoplight.io/open-source/elements)
pointed at each pillar's committed OpenAPI snapshot, so a developer can browse
the full request/response/schema surface of any pillar without grep'ing the
codebase or booting a single service.

Unlike every other pillar, `docs` owns no SQLite database, serves no contract of
its own, and does not self-register with `registry`. It is a pure static
surface: an `nginx:alpine` image whose entire content is generated at image
build time. Domain docs: [docs/README.md](docs/README.md).

## What it serves

The build walks `pillars/*` from the repo root. For each pillar that ships
`openapi/<id>.openapi.json` it copies the spec into `dist/openapi/<id>.json` and
emits a catalog entry into `dist/catalog.json` (id, display name, version,
openapi path, registry pillar id, contract tag). Pillars without an OpenAPI
snapshot are skipped — that is not an error. Package metadata (`package.json`)
is optional: Rust pillars that ship only a `Cargo.toml` still get a catalog
entry sourced from the OpenAPI `info` block.

At runtime the browser fetches `/catalog.json` and mounts Stoplight Elements: a
single `elements-api` view when there is one contract, or a left-hand pillar
switcher driving an `elements-api` stage when there are several. Because the
catalog is a build-time snapshot, the container has no runtime dependency on any
pillar or on `registry` — a redeploy reflects whatever contracts were committed
when the image was built.

### URL surface

| Path                 | Content                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `/`                  | `index.html` — bootstraps Stoplight Elements against `/catalog.json` |
| `/catalog.json`      | The build-time catalog of contracts (no-store)                       |
| `/openapi/<id>.json` | One pillar's OpenAPI spec (cached 5 min)                             |
| `/healthz`           | `{"ok":true}` for compose / healthchecks                             |

## Build and run

| Command          | What it does                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`     | `tsx scripts/collect-specs.ts` — walk `pillars/*`, emit `dist/` + `catalog.json`                                                  |
| `pnpm dev`       | `tsx scripts/dev-serve.ts` — collect, watch every pillar's `openapi/`, serve `dist/` locally on `POPS_DOCS_PORT` (default `4280`) |
| `pnpm typecheck` | `tsc --noEmit`                                                                                                                    |
| `pnpm test`      | `vitest run`                                                                                                                      |

The same tasks are exposed through `mise.toml` (`mise run build`, `dev`,
`typecheck`, `test`, `lint`). The dev server has no third-party server
dependency: Stoplight Elements loads from a CDN in `index.html`, and Node's
built-in `http`/`fs.watch` drive the local preview.

## nginx and Dockerfile

`Dockerfile` is a two-stage build. The `node:22-alpine` builder runs
`pnpm build` to populate `dist/`; the production image is `nginx:alpine` with
`dist/` copied to `/usr/share/nginx/html` and `nginx/default.conf` installed as
the server config. The image exposes port `80` and ships a `HEALTHCHECK` that
hits `/healthz`.

`nginx/default.conf` is the production static server. It serves `/catalog.json`
with `no-store`, `/openapi/` with a 5-minute cache, `/healthz` as a literal
`{"ok":true}`, and falls back to `index.html` for everything else.

## Layout

```
pillars/docs/
├── src/
│   ├── index.html          # Stoplight Elements bootstrap + catalog switcher
│   ├── styles.css          # docs surface theming
│   └── catalog.ts          # pure catalog builder (testable, no fs)
├── scripts/
│   ├── collect-specs.ts    # build: walk pillars/*, emit dist/ + catalog.json
│   └── dev-serve.ts        # `pnpm dev` — collect + watch + serve locally
├── nginx/default.conf      # prod static server (/, /catalog.json, /openapi, /healthz)
└── Dockerfile              # node:22-alpine builder → nginx:alpine
```
