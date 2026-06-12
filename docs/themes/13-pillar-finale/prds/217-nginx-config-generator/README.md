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
