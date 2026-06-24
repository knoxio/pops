# Cross-language wire-format extensions

Captures the parts of the original tRPC-era wire-format PRD (formerly PRD-231) that were never built, or that describe behaviour the REST fleet does not have. The shipped wire contract lives in [cross-language wire-format spec](../themes/federation/prds/cross-language-wire-format-spec/README.md). These are deferred — none is required for a non-TS pillar to federate today, as the Rust `contacts` pillar proves.

## Dropped because the fleet is REST, not tRPC

The original spec described a tRPC v11 wire envelope. The lake is REST-only; no live pillar speaks `/trpc`. The following are not the wire and should not be reintroduced without a new ADR:

- **`{ result: { data } }` success / `{ error: { code, message, data } }` failure envelope.** Replaced by value-direct success bodies and `{ message, code? }` error bodies on real HTTP status codes.
- **HTTP-200-carries-an-error convention.** Replaced by genuine `4xx`/`5xx` statuses.
- **Batched-procedure format** (`POST /trpc/a.x,b.y` with `{"0":…,"1":…}` body, position-preserving response array, partial-failure semantics). No batching on the wire; one call is one request.
- **`/trpc/<router>.<procedure>` URL pattern** and the `{ "input": <T> }` body wrapper. Replaced by idiomatic REST paths + value bodies, resolved from the pillar's OpenAPI `operationId`.
- **tRPC v11 error-code taxonomy** (`BAD_REQUEST`, `PRECONDITION_FAILED`, `PILLAR_UNAVAILABLE`, …) as the on-wire `code` enum. The SDK keys off HTTP status; a `code` string in the error body is informational only.

## Genuinely unbuilt extensions (could ship if a need appears)

- **`X-Pops-Wire-Version` header + a v2 deprecation window.** No version header exists anywhere in the fleet. The wire is implicitly versioned by each pillar's OpenAPI + the `contract` semver in its manifest. A header-based negotiation would only earn its keep once two incompatible wire shapes need to coexist.
- **`GET /manifest.json` endpoint.** The manifest is carried in the registration body and replayed in the discovery snapshot; no pillar serves it as a standalone GET. A read-only manifest endpoint would duplicate data already reachable via `GET /registry/pillars`.
- **gzip content negotiation.** `Content-Encoding: gzip` is neither emitted nor required; bodies are `identity`. Opt-in compression could be added behind an `Accept-Encoding` check if payload sizes warrant it.
- **Per-pillar SSE subscription procedures.** The `manifest.routes.subscriptions[]` slot exists in `ManifestPayloadSchema`, but the only live SSE stream is the registry's `GET /registry/subscribe` discovery channel. A per-procedure subscription transport (e.g. `GET <base>/<domain>.<proc>/subscribe`) would let pillars push domain events directly to consumers; today that need is met by the sink/event-type mechanism instead.
- **Black-box conformance harness.** The drafted `wire-conformance` CLI (battery of HTTP probes → green/red, stable `WF-NN-…` assertion ids, CI job per pillar) was never built. The current proof-of-compliance is integration: the Rust `contacts` pillar is consumed live by `finance`, the `orchestrator`, and the URI dispatcher. A standalone harness would let an out-of-tree pillar self-check before its first registration — worth building when the first truly external (different-repo, different-network) pillar lands.
- **Root-level `WIRE-FORMAT.md` pointer.** A discoverability shim at the repo root linking to the spec. Cheap; only matters once an external implementer is browsing the GitHub root looking for the contract.

## When to revisit

Build the conformance harness and the root pointer when the first non-TS pillar authored **outside** this monorepo asks to federate — that engineer cannot read the in-tree pillars for reference and needs an executable self-check. Everything else (wire-version header, manifest endpoint, gzip, subscription procedures) is speculative until a concrete consumer requires it.
