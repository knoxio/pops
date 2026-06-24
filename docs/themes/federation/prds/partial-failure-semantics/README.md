# Partial failure semantics

> Theme: [federation](../../README.md)

## Purpose

Federated search fans one query out to every registered, healthy, search-capable
pillar in parallel. Pillars are independent processes on the LAN; at any moment
one may be restarting, unreachable, or returning a non-ok result. The federation
must be **best-effort**: a single down pillar can never sink the whole search.

This PRD owns the failure-isolation guarantee of the federated `POST /search`
endpoint on the `orchestrator` pillar (`:3009`): the rules for what happens when
some — but not all — pillars respond, and the failure classes the federation
distinguishes internally so a future contract can surface "I got 4 of 5 sources;
here are partial results" to the UI instead of a misleading complete-empty page.

Surfacing that partial-result metadata on the wire and rendering an "(some
sources offline)" indicator in the shell is **not built** — see
[Surfacing partial-failure metadata](../../../../ideas/partial-failure-semantics.md).

## What federated search returns

The federation source projects the live registry snapshot to the search-capable
set (every registered, `healthy` pillar whose manifest declares a non-empty
`search.adapters` slot), fans the `{ query, context }` envelope out to each
pillar's `/search` over the pillar SDK, then merges + ranks + decorates the
per-pillar groups into ordered sections.

```ts
interface SearchAllResult {
  sections: SearchSection[];
}

interface SearchSection {
  domain: string; // pillar-level domain (drives context-section ordering)
  moduleId: string; // owning pillar id
  icon: string; // section-header lucide icon
  color: string; // section theming token
  isContextSection: boolean; // belongs to the current app context
  hits: SearchHit[]; // ranked, capped to HITS_PER_SECTION (5)
  totalCount: number; // full pre-cap hit count
}
```

A pillar contributes a section only when it responds with `kind: 'ok'` and at
least one hit. A pillar that is absent from the registry, unhealthy, throws, or
returns any non-ok `CallResult` contributes **nothing** — it is logged via the
warning sink and skipped. The response therefore carries no record of which
pillars were asked, which answered, or which failed: the section list is the
intersection of "asked" and "answered with hits", and everything else is
silently dropped. Closing that gap is the idea this PRD seeds.

## Failure classes the federation distinguishes

Internally the federation already separates two failure shapes per pillar, even
though neither reaches the wire today:

| Outcome                       | Detection                               | Today's behaviour       |
| ----------------------------- | --------------------------------------- | ----------------------- |
| Pillar call threw / rejected  | `Promise.allSettled` outcome `rejected` | warn + skip             |
| Pillar returned non-ok result | `CallResult.kind !== 'ok'`              | warn (with kind) + skip |

The non-ok `CallResult` discriminants are the cross-pillar SDK's universal
failure modes (`@pops/pillar-sdk/client`): `unavailable`, `degraded` (carries a
`reason: 'reconciling'`), `contract-mismatch` (carries `expected` / `actual` /
`message`), `not-found`, `conflict`, `bad-request`, and `unauthorized` (each
carrying an optional `message`). There is **no separate `timeout` kind** — a
timed-out call surfaces as `unavailable` at the SDK boundary, so a distinct
`timeoutPillars` bucket is not available from the SDK result and would have to
be reconstructed at the invoke site.

This is the structured failure information a `partial` block would carry; it
exists at the point of skip and is discarded.

## Rules

- **A down pillar never fails the search.** Each pillar's fan-out leg is
  isolated (`Promise.allSettled`); a rejection or non-ok result removes only
  that pillar's section.
- **Every failure is observable.** A skipped pillar is reported through the
  injectable warning sink (default `console.warn`), tagged with the pillar id
  and, for non-ok results, the `CallResult.kind`.
- **An empty federation degrades, never throws.** If the registry read itself
  fails (including `RegistryUnreachableError`), the search-capable set resolves
  to empty and the endpoint returns `{ sections: [] }` — matching the AI-tools
  handler's "empty list, never a 500" stance.
- **Membership is resolved per search.** A newly registered search-capable
  pillar is picked up on the next discovery refresh without restarting the
  orchestrator; a malformed snapshot row is skipped (logged), never allowed to
  sink the whole projection.

## Edge cases

| Case                  | Behaviour                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| All pillars succeed   | One `ok`-with-hits section per pillar; failure sink untouched.                            |
| Some pillars fail     | Surviving pillars' sections returned; each failure logged with id + kind; no wire signal. |
| All pillars fail      | `{ sections: [] }`; one warning per pillar; endpoint returns 200, never throws.           |
| Registry unreachable  | Empty search-capable set; `{ sections: [] }`; degraded-read warning; 200.                 |
| Pillar returns 0 hits | No section emitted for that pillar (empty groups dropped before ranking).                 |
| Blank query           | `{ sections: [] }` without touching any pillar.                                           |

## Acceptance criteria

- [x] `POST /search` fans out in parallel and isolates each pillar's leg; a
      rejected leg removes only that pillar's section.
- [x] A non-ok `CallResult` (`unavailable` / `degraded` / `contract-mismatch` /
      `not-found` / `conflict` / `bad-request` / `unauthorized`) removes only
      that pillar's section and is logged with the pillar id and the `kind`.
- [x] A pillar that throws is logged and skipped; the other pillars' sections are
      still returned.
- [x] When every pillar fails the endpoint returns `{ sections: [] }` and never
      throws.
- [x] A failed registry read (including `RegistryUnreachableError`) degrades to
      an empty search-capable set and a `{ sections: [] }` response, logged as a
      degraded read.
- [x] A malformed registry snapshot row is skipped during projection without
      sinking search for the other pillars.

## Out of scope

- Surfacing requested / responded / failed pillar lists on the `/search`
  response — see [the idea](../../../../ideas/partial-failure-semantics.md).
- A shell "X of Y sources" / "(some sources offline)" indicator — same idea.
- A distinct `timeout` failure class (timeouts surface as `unavailable`).
- Per-result confidence scoring, retry of failed pillars, long-poll for delayed
  responses.
