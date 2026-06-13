# POPS Wire Format

POPS uses a typed wire format for pillar-to-pillar and consumer-to-pillar communication. The canonical, normative specification lives in [`docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md`](docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md).

**Current version:** v1.0 (Stable) — wire header `X-Pops-Wire-Version: 1`.

## TL;DR

- **Envelope** — JSON-over-HTTP with `{ "result": { "data": <T> } }` on success and `{ "error": { "code", "message", "data" } }` on failure (tRPC v11 taxonomy). Single-call procedures hit `POST /trpc/<router>.<procedure>` with body `{ "input": <T> }`.
- **Batching** — `httpBatchLink`-shaped: comma-separated procedures in the URL, indexed entries (`{ "0": ..., "1": ... }`) in the body, response is a position-ordered JSON array where each entry independently succeeds or fails.
- **Subscriptions** — Server-Sent Events at `GET /trpc/<router>.<procedure>?input=<json>`. `data:` events terminated by `\n\n`, heartbeat comments to defeat proxies, `Last-Event-ID` for best-effort resume.
- **Manifest** — `GET /manifest.json` returns the pillar's `ManifestPayload` (id, contract, search adapters, AI tools, sinks, capabilities). Public within the docker network, `Cache-Control: no-store`.
- **Registration** — `POST <core>/trpc/core.registry.register` with `X-Internal-API-Key`, full-jitter exponential backoff up to 5 minutes. The manifest sent at registration MUST match what `GET /manifest.json` would return at that moment.

## For external implementations

External implementations should target this spec, not the TS SDK source. If `@pops/pillar-sdk` and the specification disagree, the specification wins and the SDK is the bug. A pillar is "compliant with wire-format v1" only when every assertion in the v1 conformance suite passes against it.
