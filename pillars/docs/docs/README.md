# Docs

> One navigable view of every pillar's API surface, with no pillar running.

## Overview

`@pops/docs` is a standalone pillar that serves [Stoplight Elements](https://stoplight.io/open-source/elements) pointed at every pillar's OpenAPI snapshot. It is the human-facing companion to the contract files each pillar commits: a developer, iOS engineer, or future MCP integrator can browse the full request/response/schema surface of any pillar — finance, media, the Rust `contacts` pillar, and so on — without grep'ing the codebase or booting a single service.

Unlike every other pillar, `docs` owns no SQLite database, serves no contract of its own, and does not self-register with `registry`. It is a pure static surface: an `nginx:alpine` image whose entire content is generated at image build time.

## How it works

The build step (`collect-specs.ts`) walks `pillars/*` from the repo root. For each pillar that ships `openapi/<id>.openapi.json` it:

- copies the spec into `dist/openapi/<id>.json`, and
- emits a catalog entry into `dist/catalog.json` (id, display name, version, openapi path, registry pillar id, contract tag).

The browser then fetches `/catalog.json` at runtime and mounts Stoplight Elements: a single `elements-api` view when there is one contract, or a left-hand pillar switcher driving an `elements-api` stage when there are several.

Because the catalog is a build-time snapshot, the docs container has **no runtime dependency** on any pillar or on `registry`. A container redeploy reflects whatever contracts were committed when the image was built — which is exactly the deploy semantics wanted, since contracts only change in PRs that already trigger a rebuild.

## URL surface

Served by the pillar's own nginx and reached through the shell at `/docs/`:

| Path                 | Content                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `/`                  | `index.html` — bootstraps Stoplight Elements against `/catalog.json` |
| `/catalog.json`      | The build-time catalog of contracts (no-store)                       |
| `/openapi/<id>.json` | One pillar's OpenAPI spec (cached 5 min)                             |
| `/healthz`           | `{"ok":true}` for compose / Watchtower healthchecks                  |

## Layout

```
pillars/docs/
├── src/
│   ├── index.html          # Stoplight Elements bootstrap + catalog switcher
│   ├── styles.css          # dark-mode theming aligned to the shell
│   └── catalog.ts          # pure catalog builder (testable, no fs)
├── scripts/
│   ├── collect-specs.ts    # build: walk pillars/*, emit dist/ + catalog.json
│   └── dev-serve.ts        # `pnpm dev` — collect + watch + serve locally
├── nginx/default.conf      # prod static server (/, /catalog.json, /openapi, /healthz)
└── Dockerfile              # builder (pnpm build) → nginx:alpine
```

## PRDs

| PRD                                            | Summary                                                                             | Status |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| [swagger-container](prds/swagger-container.md) | Static nginx pillar serving Stoplight Elements over every pillar's OpenAPI snapshot | Done   |

## Out of scope

- Try-It-Out execution against live pillars (would need CORS + auth).
- Cross-pillar search (Elements searches within a single spec).
- Long-form prose / markdown docs — specs only; domain prose stays in each pillar's `docs/`.
- Browsing prior contract versions — only the committed current versions are surfaced.
