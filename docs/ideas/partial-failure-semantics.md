# Surfacing partial-failure metadata

> Theme: [federation](../themes/federation/README.md) ·
> PRD: [partial-failure-semantics](../themes/federation/prds/partial-failure-semantics.md)

## Problem

Federated `POST /search` on the `orchestrator` pillar is already best-effort: a
down pillar is logged and skipped, never sinking the whole search (see the PRD).
But the failure information dies at the skip point. The response is
`{ sections: SearchSection[] }` — the section list is the intersection of "asked"
and "answered with hits". A consumer cannot tell "0 results because nothing
matched" apart from "0 results because half the fleet was offline". The shell
therefore can render a misleading complete-empty page when sources are merely
unreachable.

The structured failure data needed to fix this already exists inside the
federation source — it is just discarded instead of returned.

## Proposed contract

Extend the federated search response with a `partial` block alongside the
existing `sections`:

```ts
interface SearchAllResult {
  sections: SearchSection[];
  partial: {
    requestedPillars: string[]; // the resolved search-capable set this query fanned out to
    respondedPillars: string[]; // pillars that returned kind: 'ok'
    failedPillars: { pillar: string; kind: string; reason?: string }[];
  };
}
```

Rules:

- **Every response carries `partial`**, even when all pillars succeeded
  (`failedPillars: []`). It is a first-class field, not an error-only addition.
- `requestedPillars` is the resolved, registry-projected set — distinct from
  `respondedPillars` so the UI can compute "X of Y".
- `failedPillars` carries the `CallResult.kind` and, where the SDK provides one
  (`degraded.reason`), the human-facing reason — the exact metadata the
  federation currently logs and throws away.
- A thrown / rejected leg maps to `kind: 'rejected'` (or `'error'`) with the
  caught message as `reason`, so a non-SDK failure is still represented.

There is no `timeoutPillars` bucket: timeouts surface as `unavailable` at the
SDK boundary. If a true timeout class is wanted, the invoke site must wrap each
leg in its own deadline and tag the result before it collapses to `unavailable`.

## Shell indicator

When `partial.failedPillars` is non-empty, the shell search overlay shows an
"X of Y sources" indicator (e.g. "4 of 5 sources") and, when `respondedPillars`
is empty but `requestedPillars` is not, an explicit "(all sources offline)"
error state instead of a bare empty list. The search store
(`@pops/navigation`) would thread `partial` through to the overlay; today it
only consumes `sections`.

## Acceptance criteria

- [ ] `POST /search` returns a `partial` block on every response, including when
      all pillars succeed (`failedPillars: []`).
- [ ] `requestedPillars` lists the resolved search-capable set; `respondedPillars`
      lists only `kind: 'ok'` pillars; their difference equals the failed set.
- [ ] `failedPillars` carries each skipped pillar's id, `CallResult.kind`, and a
      `reason` where the SDK supplies one (degraded / thrown).
- [ ] The shell renders an "X of Y sources" indicator when `failedPillars` is
      non-empty.
- [ ] The shell renders an explicit error state (not a blank empty result) when
      `respondedPillars` is empty and `requestedPillars` is not.
- [ ] The `partial` block is added to the `@pops/types` search response contract
      so pillar, orchestrator, and shell share one shape.

## Out of scope

- Per-result confidence scoring.
- Retry of failed pillars.
- Long-poll / late-arriving results for delayed pillars.
- A distinct `timeout` failure class.
