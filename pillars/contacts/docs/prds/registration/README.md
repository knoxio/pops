# Registration

## Purpose

On boot, `contacts` self-registers with the `registry` pillar and then heartbeats
to stay a live member, deregistering on graceful shutdown. This is the Rust
reference implementation of the lifecycle every TypeScript pillar runs via
`@pops/pillar-sdk`'s `bootstrapPillar` — same envelopes, same backoff policy,
same self-healing path resolver — so the registry treats contacts identically to
any TS pillar.

This is an **outbound** unit: contacts is the HTTP client, the `registry` pillar
is the server. It owns no DB tables.

## Manifest

contacts pushes a static capability manifest in the register envelope. It is
byte-shape-compatible with the SDK's `ManifestPayloadSchema`, which the registry
validates on register; a rejected manifest is a non-retriable `400`. Key fields:

- `pillar: "contacts"`, `version`, and a `contract` block
  (`package: "@pops/contacts"`, derived `version` and `tag`).
- `routes` listing the three-segment procedure paths
  (`contacts.entities.list`, `contacts.entities.get`, `contacts.search.search`
  as queries; `contacts.entities.create/update/delete` as mutations).
- `search.adapters` (the contacts search adapter — see the [search](../search/README.md) unit).
- `uri.types: ["contacts/contact"]`, `healthcheck.path: "/health"`.
- `pages: [{ path: "", index: true, bundleSlot: "contacts-list" }]`.
- Empty `ai.tools`, `consumedSettings.keys`, and `settings.manifests`.

> Two grammars are deliberately distinct: manifest `routes` / adapter
> `procedurePath` use the **three-segment** `<pillar>.<router>.<procedure>` form
> (`contacts.entities.list`); the OpenAPI `operationId` uses the **two-segment**
> `<router>.<procedure>` form (`entities.list`).

### Version coercion

The manifest schema requires a strict semver (`\d+.\d+.\d+(-[a-z0-9.]+)?`, no
`+build` metadata, no uppercase). Watchtower-driven deploys inject a git SHA as
`BUILD_VERSION`, which is not semver. A non-conforming value is coerced to
`0.0.0-sha.<sanitized first 7 chars>` (lowercased, non-`[a-z0-9.]` chars → `0`),
which always passes validation; an already-valid value passes through unchanged.

## Handshake

contacts POSTs JSON envelopes to the registry:

| Operation  | Body                                          | When                                                             |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------- |
| register   | `{ pillarId: "contacts", baseUrl, manifest }` | On boot, then again whenever a heartbeat reports not-registered. |
| heartbeat  | `{ pillarId }`                                | Every 10s.                                                       |
| deregister | `{ pillarId }`                                | Best-effort on graceful shutdown.                                |

### Path resolution

Each operation is reachable at two HTTP paths during the `core→registry` rename
window: the canonical slash form (`/registry/register`) and the legacy dotted
form (`/core.registry.register`). The transport tries canonical first and falls
back to legacy **only on a 404**, caching the winning path per operation:

- 2xx → remember the winning path; steady state issues one request.
- 404 on the cached winner (e.g. the registry rolled back to legacy-only) →
  invalidate the hint and fall through to the other candidate **within the same
  call**, so a single 404 self-heals without a failed heartbeat.
- Any non-404 error (5xx / network) → surface immediately; "up but broken" is
  not "path unknown", so the other candidate is **not** tried.

### Heartbeat outcomes

The registry's heartbeat route soft-fails at HTTP 200 with
`{ ok: false, reason: "not-registered" }` when it has no row for the pillar.
contacts distinguishes this from an acknowledged heartbeat
(`{ ok: true, … }`) and re-registers, instead of heartbeating into the void.
A missing/odd body is treated conservatively as not-registered.

## Rules

- **Registry self-registration is opt-in** via `POPS_REGISTRY_ENABLED=true`
  (off in local/test so a dev run never reaches out). Registry origin resolves
  `POPS_REGISTRY_URL` → `CORE_URL` → `http://registry-api:3001`.
- **`baseUrl`** (the origin the registry records for this pillar) resolves
  `CONTACTS_SELF_BASE_URL` → `http://localhost:<port>`.
- **Register retries with exponential backoff** `min(initial * 2^(n-1), max)`
  (defaults: initial 1s, max 30s, 5 attempts) on transient failures, but
  **fails fast** on a non-retriable `4xx` (a rejected manifest will not succeed
  on retry).
- **Retriability:** a network failure or a `>= 500` response is retriable; a
  `4xx` is not.
- **Registration never crashes the pillar.** If register exhausts its retries
  the server still serves its HTTP surface; the heartbeat loop keeps trying so
  membership is re-established the moment the registry recovers.
- **A not-registered heartbeat triggers an immediate re-register** (with the same
  backoff), then the cadence resumes.
- **Shutdown is prompt.** The register+heartbeat sequence races against a
  shutdown signal, so a SIGTERM mid-backoff aborts at once and proceeds straight
  to the best-effort deregister — shutdown latency is bounded by one in-flight
  request, never the remaining backoff budget.
- **Per-request timeout is 10s** so a hung TCP connection cannot block boot or
  shutdown.

## Acceptance criteria

- [x] On boot (when enabled), contacts POSTs `{ pillarId, baseUrl, manifest }` to the registry's register path.
- [x] The manifest is shape-compatible with the SDK `ManifestPayloadSchema`: `pillar`, `version`, `contract`, three-segment `routes`, the `contacts` search adapter, `uri.types`, `healthcheck`, and empty `ai`/`consumedSettings`/`settings`.
- [x] A non-semver `BUILD_VERSION` (git SHA, branch name, `+build` metadata) is coerced to a manifest-valid `0.0.0-sha.<…>`; an already-valid semver passes through unchanged.
- [x] Register retries transient failures with exponential backoff capped at the configured max attempts, and fails fast on a non-retriable `4xx`.
- [x] Path resolution tries the canonical slash path first, falls back to the legacy dotted path on a 404 only, caches the winner, and self-heals a cached-winner 404 within the same call.
- [x] A 5xx or network error surfaces immediately without trying the other candidate path.
- [x] A heartbeat fires every 10s; a `{ ok: false, reason: "not-registered" }` (or missing-ok) response triggers a re-register.
- [x] A failed initial registration leaves the HTTP surface serving and the heartbeat loop running.
- [x] Graceful shutdown cancels the loop mid-backoff and deregisters best-effort exactly once.
- [x] Self-registration is gated behind `POPS_REGISTRY_ENABLED=true`.
