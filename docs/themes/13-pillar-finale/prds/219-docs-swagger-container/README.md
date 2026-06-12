# PRD-219: pops-docs container with Stoplight Elements

> Epic: [Contract packages](../../epics/00-contract-packages.md)

## Overview

A tiny new container (`pops-docs`) that serves a Stoplight Elements multi-spec browser pointed at every `packages/<pillar>-contract/openapi/<pillar>.openapi.json` file in the monorepo. Browseable at `https://pops/docs/` once deployed — gives every developer (and future iOS / CLI / MCP integrator) a live, navigable view of every contract's full API surface, with request builder, schema browser, and search across pillars. "Just for kicks" framing accepted; the actual cost is ~30 lines of HTML + a 50MB nginx-static image, and the operational value (debug an unfamiliar pillar's API without grep'ing the codebase) compounds fast.

## Data Model

### Container

```
apps/pops-docs/
├── package.json
├── Dockerfile
├── src/
│   ├── index.html              # Stoplight Elements bootstrap
│   ├── catalog.json            # generated; lists every contract + its openapi.json path
│   └── styles.css              # minimal theming
├── scripts/
│   ├── collect-specs.ts        # build step: scan packages/*-contract/openapi/, emit catalog.json + copy specs
│   └── dev-serve.ts            # `pnpm dev` — local dev with hot reload as contracts change
└── nginx/
    └── default.conf            # serves /, /openapi/<pillar>.json, /catalog.json
```

### `catalog.json` shape (generated at build time)

```jsonc
{
  "generatedAt": "<git-commit-sha>",
  "contracts": [
    {
      "id": "finance",
      "name": "Finance",
      "version": "1.4.2",
      "openapiPath": "/openapi/finance.json",
      "registryPillarId": "finance",
      "contractTag": "contract-finance@v1.4.2",
    },
    {
      "id": "media",
      "name": "Media",
      "version": "0.3.0",
      "openapiPath": "/openapi/media.json",
      "registryPillarId": "media",
      "contractTag": "contract-media@v0.3.0",
    },
    // ...one per contract package
  ],
}
```

The catalog feeds Stoplight Elements' `<elements-stoplight-project>` web component, which renders the multi-spec navigation pane on the left and the active spec's docs on the right.

## API Surface

### URLs served

| Path                     | Content                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `/`                      | `index.html` — bootstraps Stoplight Elements pointed at `/catalog.json` |
| `/catalog.json`          | The catalog (generated at image build time)                             |
| `/openapi/<pillar>.json` | The individual contract's OpenAPI spec (one file per pillar)            |
| `/healthz`               | `{"ok": true}` — for Watchtower + compose healthchecks                  |

No tRPC, no API calls — entirely static. No registry dependency at runtime; the catalog snapshot reflects the contracts that existed at image build time.

### Compose entry

```yaml
pops-docs:
  image: ghcr.io/knoxio/pops-docs:${POPS_IMAGE_TAG:-main}
  container_name: pops-docs
  restart: unless-stopped
  labels:
    com.centurylinklabs.watchtower.enable: 'true'
  networks:
    - frontend
  expose:
    - '80'
  healthcheck:
    test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:80/healthz']
    interval: 30s
    timeout: 5s
    retries: 3
```

### nginx dispatcher rule (in `apps/pops-shell/nginx.conf`)

```nginx
location /docs/ {
    proxy_pass http://pops-docs:80/;
    proxy_set_header Host $host;
    # short timeouts; static content
    proxy_connect_timeout 5s;
    proxy_read_timeout 10s;
    proxy_send_timeout 10s;
}
```

## Business Rules

- **Stoplight Elements is the renderer.** Loaded as a CDN script tag in `index.html` (no bundler needed). The version is pinned to a specific Elements release for reproducibility.
- **The catalog is generated at image build time, not at runtime.** A container redeploy reflects the contracts that existed at the moment the image was built. This is acceptable because contracts only change in PRs, which already trigger a rebuild via the Watchtower flow.
- **One Stoplight project per contract.** Each contract gets its own navigation entry; users can switch between pillars in the left sidebar.
- **The container has no runtime dependency on the pillar containers.** It's pure static. The OpenAPI specs it serves were generated at contract build time per PRD-153 and committed to git; the docs container copies them into its image.
- **Auto-discovery of contracts.** `scripts/collect-specs.ts` walks `packages/*-contract/openapi/*.openapi.json` — no manual catalog maintenance. Adding a new contract → automatically appears in the docs container's next build.
- **Version + tag metadata in the catalog.** Each contract entry includes its current `package.json` version and the matching git tag. Useful for developers cross-referencing the docs against a specific contract release.
- **Dev script for local hot-reload.** `pnpm dev` under `apps/pops-docs/` serves locally with file-watching so contract authors can preview changes before committing.
- **Theme matches the shell's design.** Tiny `styles.css` overrides Stoplight Elements' default theme to align with pops's UI tokens (dark mode default, accent colour matches).

## Edge Cases

| Case                                                                           | Behaviour                                                                                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A contract package exists but has no `openapi/<pillar>.openapi.json` yet       | `collect-specs.ts` skips it with a warning. The catalog excludes it; no error.                                                                 |
| Two contracts have the same `openapi.info.title`                               | Catalog uses the contract package's directory name as the canonical id; the title is just a label. No collision.                               |
| Stoplight Elements upstream changes its API                                    | Pinned version protects against drift. Upgrades are explicit PRs.                                                                              |
| Contract was deleted in a PR but its OpenAPI spec still sits in the docs image | `collect-specs.ts` only emits entries for contracts that exist; deletion implicitly removes the spec from the catalog on the next image build. |
| Docs container is down                                                         | nginx dispatcher rule 502s; `/docs/` shows a generic "service unavailable" page. Non-critical — no other functionality depends on it.          |
| Catalog has 30+ contracts                                                      | Stoplight Elements' navigation pane scrolls; no UX degradation. Tested up to 50 specs without issue.                                           |
| A consumer wants to load the catalog programmatically                          | `/catalog.json` is a stable JSON endpoint with versioned schema; can be fetched + parsed by CI, IDE plugins, etc.                              |
| Image size grows as more contracts are added                                   | Each contract's OpenAPI spec is ~30-100kb. 20 contracts ≈ 2MB of specs + ~50MB of base nginx-alpine + Stoplight Elements CDN. Acceptable.      |

## User Stories

| #   | Story                                                             | Summary                                                                                        | Parallelisable    |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| 01  | [us-01-container-scaffold](us-01-container-scaffold.md)           | `apps/pops-docs/` package skeleton, Dockerfile (nginx-alpine), basic compose entry             | yes — independent |
| 02  | [us-02-collect-specs-script](us-02-collect-specs-script.md)       | `scripts/collect-specs.ts` — discovers contracts, emits `catalog.json`, copies OpenAPI files   | blocked by us-01  |
| 03  | [us-03-stoplight-bootstrap](us-03-stoplight-bootstrap.md)         | `index.html` loads Stoplight Elements pointing at `/catalog.json`; renders the multi-spec view | blocked by us-02  |
| 04  | [us-04-nginx-dispatcher](us-04-nginx-dispatcher.md)               | Add `/docs/` location block to `apps/pops-shell/nginx.conf`; route to pops-docs:80             | blocked by us-01  |
| 05  | [us-05-dev-serve](us-05-dev-serve.md)                             | `pnpm dev` — local serve with file-watch on contract changes                                   | blocked by us-03  |
| 06  | [us-06-theming](us-06-theming.md)                                 | `styles.css` matches pops UI tokens; dark mode default                                         | blocked by us-03  |
| 07  | [us-07-healthcheck-plus-deploy](us-07-healthcheck-plus-deploy.md) | `/healthz` endpoint; homelab-infra compose entry + redeploy to capivara                        | blocked by us-04  |

## Out of Scope

- Per-contract authentication (the docs are public to anyone who can reach the shell). If a contract has sensitive procedures (e.g. `core.serviceAccounts.create`), they're already gated by JWT at the runtime layer; the docs just describe them.
- "Try-it-out" execution against live pillar containers. Stoplight's Try-It feature would require CORS + auth setup; deferred.
- Searchable cross-contract index — Stoplight Elements has built-in search per spec; cross-spec search is a separate concern.
- Markdown / prose documentation alongside the API specs (e.g. "how to use the finance API"). Specs only for now; long-form docs stay in `docs/` and are served separately if needed.
- Versioned docs (browsing prior contract versions) — only the current versions are surfaced. Past versions are accessible via git tags but not via the docs UI.
- Custom theming beyond a tiny tokens override.
- iOS app accessing this UI directly. The iOS app reads the committed `openapi.json` via Swift codegen at build time — the docs container is a separate, complementary surface for humans.
