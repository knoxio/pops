# US-07: Post-Ingest Review and Edit

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As a user who just captured an engram in capture mode (US-01) or via the global hotkey (US-09), I want the result view to surface what the curation worker inferred and let me edit any of it inline so that I can correct mistakes without leaving the capture flow and without ever filling a form upfront.

## Acceptance Criteria

- [x] Immediately after `cerebrum.ingest.quickCapture` succeeds, the result view shows the engram id, file path, source, and the scopes assigned at write time (the user's suggestions if any, otherwise the fallback)
- [x] The result view subscribes to enrichment status for the engram id and updates in place when the curation worker finishes — without a manual refresh
- [x] When enrichment completes, the inferred `type`, `template`, `scopes`, and `tags` appear as editable chips/fields on the same card; the body of the engram is not re-displayed (the user just typed it)
- [x] Each chip is editable in place — clicking a chip opens a popover with the same picker semantics as the capture surface (type selector, scope autocomplete from `cerebrum.scopes.list`, tag autocomplete from `cerebrum.tags.list`)
- [x] When the scope reconciliation service (US-10) returns a canonical alternative for any user-suggested scope, the alternative is shown next to that scope chip as a "Did you mean: `<canonical>`?" affordance with a one-click accept that replaces the original chip
- [x] Accepting a canonical suggestion calls `cerebrum.engrams.update` to replace the user's scope with the canonical one and clears the suggestion from the engram's `_scope_suggestions` custom field
- [x] Dismissing a canonical suggestion clears it without changing the scope; the next time the same engram is enriched the dismissed suggestion is not re-proposed (tracked via `_scope_suggestions_dismissed` custom field, segment-set keyed)
- [x] Edits call `cerebrum.engrams.update` with the changed field only and reflect the new value on success without a full re-fetch
- [x] An "Open in editor" link navigates to the engram detail page (PRD-077) for full body editing, version history, and deletion
- [x] If enrichment is still pending when the user navigates away, the next visit to the engram detail page shows the same inferred values and pending suggestions as soon as they're available (no state lost)
- [x] If enrichment fails (LLM error, queue failure), the result view shows a "retry enrichment" action that re-enqueues the `classifyEngram` job for the same engram id
- [x] A "Capture another" action resets the surface to an empty body editor without leaving the page, preserving keyboard focus on the body input

## Notes

- The async enrichment job is the `classifyEngram` background job. It is idempotent via the `_enrichedHash` custom field — re-running it on unchanged content is a no-op, so the retry action can fire freely.
- For enrichment status updates, prefer polling against a new `cerebrum.ingest.enrichmentStatus` query (input: `engramId`) over adding a streaming channel just for this view. Polling at 1 s for the first 10 s, then 5 s for the next 30 s, then stop and require manual refresh is acceptable.
- The chip edit popovers reuse the same scope autocomplete component built for the capture surface (US-01).
- Scope-suggestion data lives on the engram itself in custom fields `_scope_suggestions: Array<{ original, canonical, confidence, reason }>` and `_scope_suggestions_dismissed: string[]` (segment-set keys, e.g. `fedx|karbon|meetings|work`). The reconciliation algorithm is in US-10.
- The "retry enrichment" action requires exposing a mutation on the existing `cerebrum.ingest` router that re-enqueues the `classifyEngram` job for a given engram id.
- This US assumes the engram already exists; there is no creation path here. Creation is US-01 (capture mode) or US-02 (agent input).
