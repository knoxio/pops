# MCP write tools — conflict / not-found failure-path tests

The inventory MCP write tools (`pillars/mcp/src/tools/inventory-locations.ts`,
`inventory-items-write.ts`, `inventory-connections.ts`) funnel every pillar
`CallResult` through `mapCallResult` in `pillars/mcp/src/tools/utils.ts`, which
maps the `conflict`, `not-found`, `bad-request`, and `unauthorized` failure
kinds to an MCP `toolError` (`isError: true`) with a model-readable reason.

The existing suites only stub `unavailable` and `contract-mismatch` for the
transport-failure assertions, and `utils.test.ts` does not call `mapCallResult`
at all. So these branches are implemented but unverified:

- `inventory.connections.connect` on an already-connected pair → the inventory
  pillar returns `conflict`; the tool should surface `isError` with the pillar's
  message.
- `inventory.connections.disconnect` on a non-existent link → `not-found` →
  `isError`.
- The `bad-request` and `unauthorized` arms of `formatFailureReason`, including
  the `message ?? MESSAGE_FALLBACK[kind]` fallback wording.

## Proposed work

- Add `callConflict` / `callNotFound` (and optionally `callBadRequest`,
  `callUnauthorized`) helpers to `test-helpers.ts` returning the matching
  `CallResult` shapes.
- Assert `connect` conflict and `disconnect` not-found produce `isError: true`
  and carry the pillar-provided reason text through to the MCP result.
- Add a focused `utils.test.ts` block over `mapCallResult` covering every
  failure kind and the message-fallback path, so the mapping is pinned even if
  no individual tool re-stubs it.
