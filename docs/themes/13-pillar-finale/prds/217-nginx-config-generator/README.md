# PRD-217: nginx config generator

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)

## Overview

Replace hand-maintained nginx dispatcher rules with a generator that reads the registry snapshot and emits `default.conf`. New pillars appear in the dispatcher automatically when their image deploys; no manual config update.

## Data Model

No data; produces `apps/pops-shell/nginx/default.conf` at image build time.

## API Surface

### Script

```sh
scripts/generate-nginx-conf.ts
# Reads from POPS_REGISTRY_URL (or a local seed JSON in offline / dev mode)
# Emits default.conf with per-pillar prefix locations
```

### Workflow

Two operating modes:

1. **Image build time** (default): script runs as part of the pops-shell Dockerfile; output is baked into the image.
2. **Runtime init container** (alternative): a sidecar polls the registry and writes the conf; nginx reloads on change.

PRD picks **image build time** initially — simpler, no runtime dep.

## Business Rules

- **Generated conf is deterministic.** Same registry snapshot = identical output.
- **Includes a fallback for /trpc** (legacy pops-api).
- **Generated conf is NOT committed to git** — produced fresh per image build.
- **A schema validator** runs the generator output through `nginx -t` to catch syntax errors before image push.

## Edge Cases

| Case                             | Behaviour                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Registry is empty at build time  | Generated conf has only the legacy fallback.                                                                       |
| New pillar registers after build | Until image rebuild, the dispatcher doesn't know. Acceptable since pillar deployment is paired with shell rebuild. |
| nginx -t fails                   | Build fails; no broken image.                                                                                      |

## User Stories

| #   | Story                                                           | Summary                                              |
| --- | --------------------------------------------------------------- | ---------------------------------------------------- |
| 01  | [us-01-generator-script](us-01-generator-script.md)             | The TS script that reads registry → emits conf       |
| 02  | [us-02-dockerfile-integration](us-02-dockerfile-integration.md) | Run generator in pops-shell Dockerfile build step    |
| 03  | [us-03-validation](us-03-validation.md)                         | `nginx -t` validation in CI                          |
| 04  | [us-04-tests](us-04-tests.md)                                   | Generator tests against synthetic registry snapshots |

## Out of Scope

- Runtime nginx reload (image-build-time only).
- Per-host config overrides (single-host assumption).
- TLS termination changes.

## Implementation Status

> Audit date: 2026-06-13. Compares the PRD against shipped code on `main`.
> Branch under audit: `feat/theme13-prd-217-status-update`.

### Shipped state

- `apps/pops-shell/nginx.conf` is hand-written and committed. It carries one
  prefix-match `location /trpc-<pillar>/` block per pillar (core, inventory,
  media, finance, food, lists, cerebrum) plus the legacy `/trpc` catch-all,
  the `/pillars` registry proxy, `/media/images/`, `/health`, `/docs/`, and
  the SPA fallback. That file is the artefact PRD-190 produced.
- `apps/pops-shell/nginx/conf.d/_pillar-proxy.conf` carries the shared
  proxy directives every per-pillar block `include`s.
- `apps/pops-shell/Dockerfile` `COPY`s `nginx.conf` straight into
  `/etc/nginx/conf.d/default.conf` and the partial into
  `/etc/nginx/snippets/_pillar-proxy.conf`. No generator step runs at image
  build time.
- `apps/pops-shell/scripts/validate-nginx-conf.sh` runs `nginx -t` on the
  hand-written conf inside `nginx:alpine`. It skips when Docker is absent
  unless `REQUIRE_DOCKER=1`.
- No `scripts/generate-nginx-conf.ts` exists anywhere in the repo. The
  registry-driven generator path is not started.

### Acceptance Criteria

The PRD uses the US pattern (four stories listed under `## User Stories`),
but none of `us-01-generator-script.md` / `us-02-dockerfile-integration.md`
/ `us-03-validation.md` / `us-04-tests.md` exist on disk yet — the PRD
folder contains only `README.md`. Status is therefore audited against the
PRD-level deliverables described in `## API Surface`, `## Business Rules`,
and `## User Stories` directly.

| Status      | Item                                                                             | Evidence / Gap                                                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not started | `scripts/generate-nginx-conf.ts` reads registry snapshot → emits `default.conf`  | No file exists. No code reads `POPS_REGISTRY_URL` or a seed JSON to emit nginx config. `nginx.conf` is hand-maintained per PRD-190.                                                                                              |
| Not started | Operating mode: image build time (generator runs inside `pops-shell` Dockerfile) | `apps/pops-shell/Dockerfile` does `COPY apps/pops-shell/nginx.conf …` directly. No `RUN tsx scripts/generate-nginx-conf.ts` step, no `BUILDKIT` mount of a registry snapshot.                                                    |
| Not started | Deterministic output (same registry snapshot → identical conf)                   | N/A until the generator exists. Determinism property cannot be verified yet.                                                                                                                                                     |
| Partial     | Legacy `/trpc` fallback to pops-api                                              | The fallback **does** exist in the hand-written `nginx.conf` (`location /trpc { proxy_pass http://pops-api:3000/trpc; … }`). Once the generator lands it has to preserve this block, but the shipped behaviour is already there. |
| Not started | Generated conf not committed to git                                              | Moot — nothing is generated. `apps/pops-shell/nginx.conf` is committed and is the production source.                                                                                                                             |
| Partial     | `nginx -t` validation in CI on the generator output                              | `apps/pops-shell/scripts/validate-nginx-conf.sh` runs `nginx -t` against the hand-written `nginx.conf` + partial. The harness is there; it just isn't wired to a generator output. It also silently skips when Docker is absent. |
| Not started | Edge case — empty registry at build time emits only the legacy fallback          | No generator, no behaviour to test.                                                                                                                                                                                              |
| Not started | Edge case — `nginx -t` failure during build fails image push                     | The script only skips when Docker is absent; the `REQUIRE_DOCKER=1` lever exists but is not wired into the pops-shell image-build pipeline. CI gating against the generator output is not started.                               |
| Not started | US-01 — TS generator script reads registry, emits conf                           | File does not exist; US file `us-01-generator-script.md` also does not exist.                                                                                                                                                    |
| Not started | US-02 — Dockerfile integration runs the generator at image-build time            | Dockerfile copies the hand-written conf directly; US file `us-02-dockerfile-integration.md` does not exist.                                                                                                                      |
| Partial     | US-03 — `nginx -t` validation in CI                                              | Validation script exists for the hand-written conf; not yet exercising generator output. US file `us-03-validation.md` does not exist.                                                                                           |
| Not started | US-04 — generator tests against synthetic registry snapshots                     | No generator → no tests. US file `us-04-tests.md` does not exist.                                                                                                                                                                |

### Overall

- **PRD-190 (dispatcher simplification) shipped first and is doing the work
  PRD-217 was meant to remove.** The hand-written prefix-match conf is
  small, DRY (via `_pillar-proxy.conf`), and validated by
  `validate-nginx-conf.sh`. Adding a pillar today requires editing
  `nginx.conf` by hand.
- **PRD-217 has not started.** No generator script, no Dockerfile
  generator step, no registry-snapshot input path, no US files on disk.
- **Open question for the next planner:** with PRD-190's prefix-match
  layout in place, the PRD-217 generator is now a small templating job
  (loop over pillars → emit a `location /trpc-<id>/` block per the existing
  shape). Re-scoping the PRD around the post-190 reality (instead of the
  pre-190 regex-dispatcher world) may be worth doing before the four US
  files get drafted.
