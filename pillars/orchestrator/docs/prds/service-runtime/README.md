# Orchestrator service runtime

> Domain: [Orchestrator](../../README.md)
>
> Status: **Done**

## Purpose

Define the orchestrator container itself: how it boots, how it joins the federation, and the operational surface (`/health`, `/pillars`) it exposes alongside its two aggregator endpoints. The cross-pillar aggregators are specified in their own PRDs ([federated-search](../federated-search/README.md), [ai-tool-registry](../ai-tool-registry/README.md)); this PRD covers the runtime they mount on.

The orchestrator is a **stateless** cross-pillar aggregator. It owns no database. All state it touches is the registry snapshot (read through the SDK discovery cache) and the per-request fan-out results.

## Data model

None. There is no database, no migrations, no persistent state.

## Runtime configuration

| Env                          | Purpose                                                                                                                                                                                            | Default                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `PORT`                       | HTTP listen port. Must be an integer in 1–65535 or boot fails loudly.                                                                                                                              | `3009`                                   |
| `BUILD_VERSION`              | Semver surfaced on `/health` and in the boot manifest.                                                                                                                                             | `dev`                                    |
| `ORCHESTRATOR_SELF_BASE_URL` | Bare http(s) origin the orchestrator is reachable at; published as the synthetic `orchestrator` entry's `baseUrl`. Normalised through the bare-origin parser — a path/query/fragment crashes boot. | `http://localhost:${PORT}`               |
| `POPS_REGISTRY_URL`          | Bare origin of the registry pillar for the discovery client. Validated through the same bare-origin parser.                                                                                        | SDK default (`http://registry-api:3001`) |
| `POPS_REGISTRY_ENABLED`      | When `true`, the process self-registers with the registry on boot.                                                                                                                                 | unset (no registration)                  |
| `POPS_PILLARS`               | Boot seed (`id:baseUrl[,id:baseUrl…]`) used as the `GET /pillars` fallback when the registry is unreachable. Malformed input throws rather than silently dropping entries.                         | empty                                    |

## API surface

| Method | Path        | Response                                                                                                           |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/health`   | `{ ok: true, status: "ok", service: "orchestrator", version, ts }`. Pure liveness — no DB, no registry round-trip. |
| `GET`  | `/pillars`  | `{ pillars: [{ id, baseUrl }, …] }`. Registry-first fleet view, self-entry first.                                  |
| `POST` | `/search`   | Federated search — see [federated-search](../federated-search/README.md).                                          |
| `GET`  | `/ai/tools` | AI-tool registry — see [ai-tool-registry](../ai-tool-registry/README.md).                                          |

JSON request bodies are capped at 512kb. `x-powered-by` is disabled.

## Pillar discovery and the `/pillars` view

`GET /pillars` is **registry-as-truth** with a seed fallback:

- The live registry snapshot (via the SDK discovery client) is the primary source. A registered pillar's fresh `baseUrl` wins over a stale `POPS_PILLARS` seed entry for the same id.
- `POPS_PILLARS` seed entries backfill only ids the live snapshot has no entry for. The seed must never shadow a registered pillar.
- The synthetic `orchestrator` self-entry is always prepended, derived from `ORCHESTRATOR_SELF_BASE_URL`; a stale `orchestrator` entry in either source is dropped in favour of it.
- When the registry is unreachable **and** nothing is cached, the view degrades to the env-only seed projection so a cold-start / outage still yields a usable fleet view.

## Self-registration

When `POPS_REGISTRY_ENABLED=true`, the process registers an orchestrator manifest with the registry on boot using the same `bootstrapPillar` handshake every pillar uses. Because the orchestrator owns no domain, its manifest declares **empty** `routes`, `search`, `ai`, and `uri` dimensions and a `/health` healthcheck path — it participates in the fleet without advertising any capability of its own.

`SIGTERM` / `SIGINT` trigger an explicit deregister (the heartbeat handle's `stop()`) before the HTTP server closes, so the registry sees a clean departure rather than a missed heartbeat.

## Partial-failure stance

Every cross-pillar surface degrades rather than failing the whole request:

- A registry read failure on a fan-out surface yields the safe empty result (empty sections / empty tool list), logged, never a 500 from the registry being down.
- A single down/erroring pillar is dropped from the result; the survivors still answer.
- A 500 from `POST /search` is reserved for an _unexpected_ throw in the pipeline, not for a pillar being unavailable.

The detailed partial-failure response shape for the federated runner (`requestedPillars` / `respondedPillars` / `failedPillars` / `timeoutPillars`) is the SDK framework's contract — see [PRD-199](../../../../../docs/themes/13-pillar-finale/prds/199-partial-failure-semantics/README.md).

## Edge cases

| Case                                                                             | Behaviour                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `PORT` not a 1–65535 integer                                                     | Boot throws loudly.                                                             |
| `ORCHESTRATOR_SELF_BASE_URL` / `POPS_REGISTRY_URL` carries a path/query/fragment | Boot throws loudly (bare-origin parser).                                        |
| Malformed `POPS_PILLARS` (missing colon, duplicate id, bad slug)                 | Boot throws loudly rather than dropping entries silently.                       |
| `POPS_REGISTRY_ENABLED` unset                                                    | Process serves traffic but never registers; the fleet does not see it.          |
| Registry unreachable with empty cache                                            | `/pillars` serves the `POPS_PILLARS` seed (self-entry only when seed is empty). |

## Acceptance criteria

- [x] `GET /health` returns `{ ok: true, status: "ok", service: "orchestrator", version }` with a parseable ISO `ts`, and performs no DB or registry call.
- [x] `GET /pillars` returns only the synthetic `orchestrator` self-entry when the registry is empty and `POPS_PILLARS` is unset.
- [x] `GET /pillars` lists the parsed `POPS_PILLARS` seed behind the self-entry when the registry is empty.
- [x] A stale `orchestrator` entry in `POPS_PILLARS` is dropped in favour of the live self-entry.
- [x] A registry-registered pillar appears in `GET /pillars` even when `POPS_PILLARS` is unset.
- [x] A live registration wins over a stale seed entry for the same id; a seed-only id is backfilled after the live entries.
- [x] An invalid `PORT`, a non-bare `ORCHESTRATOR_SELF_BASE_URL` / `POPS_REGISTRY_URL`, or a malformed `POPS_PILLARS` crashes boot rather than starting in a broken state.
- [x] When `POPS_REGISTRY_ENABLED=true`, the process registers a manifest with empty `routes`/`search`/`ai`/`uri` dimensions and deregisters on `SIGTERM`/`SIGINT` before closing the server.
      </content>
