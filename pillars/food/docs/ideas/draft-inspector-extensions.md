# Idea: Draft-inspector extensions

Forward-looking work deliberately excluded from the shipped [draft-inspector](../prds/draft-inspector.md). The inspector (three panes, `getForReview` aggregate, approve/reject/undo/re-run, per-kind provenance bodies) is built; these are the next layers — mostly richer provenance rendering and layout polish.

## Resizable panes + persisted widths

The layout ships as a fixed responsive grid: a `25/45/30` three-column split on `lg:` and up, stacked single-column (decision first, so Approve is above the fold) below. The original design called for **resizable panes via a horizontal split**, with the per-user widths persisted in `localStorage`. The drag handles and persistence are not built — `InspectorPage` ships the static grid and tracks this as a deferred follow-up.

## Richer Instagram provenance

`ProvenanceUrlInstagram` renders the saved reel `<video>` (served from `GET /food-api/ingest/source/:id/video`, with native `<video>` Range-seek) plus a collapsible **caption** section. The fuller provenance surface the design called for is not built because it depends on richer pipeline meta-JSON shapes than the handlers ship today:

- **STT transcript** with timestamps, each line **click-to-seek** the video.
- **Keyframe gallery** (lazy-loaded, `loading="lazy"`, CSS-downscaled full-size images; no separate thumbnail tier) with click-to-open full-size.
- **Vision LLM raw output** (collapsed).

## Richer web provenance

`ProvenanceUrlWeb` renders the clickable URL plus a sandboxed `<iframe sandbox="allow-same-origin">` preview. Not built:

- **"Source viewed at &lt;fetched-at&gt;"** timestamp.
- **JSON-LD raw output** (collapsed) when the structured-data extractor found it.
- **Readability HTML excerpt** (collapsed) when the readability path produced one.

## Screenshot zoom-on-click

`ProvenanceScreenshot` renders the full-size `<img>` (served from `GET /food-api/ingest/source/:id/screenshot`). The **zoom / lightbox on click** affordance is not built.

## Per-signal `detail` strings on the quality card

`QualityBandCard` renders the full (non-truncated) signal list with each signal's code and weight. The `detail` string each `QualitySignal` carries on the wire (e.g. "4 proposed slugs", "no yield specified") is plumbed through `getForReview` but not yet shown next to the signal — only the weight is rendered. Surfacing `detail` would make the band assignment self-explanatory without cross-referencing `quality-heuristic`.

## Terminal-state banners

The decision pane disables Approve while `source.state === 'processing'` and swaps to the Undo/rejection-details panel for archived versions. Two explicit status banners the edge-case table called for are not built:

- **"This draft was approved on &lt;date&gt;"** when a sibling tab approved the draft mid-session (`status === 'current'`, `reviewedAt` set). Today only `status === 'archived'` flips the editor read-only and swaps the decision controls; a `current` draft still renders an editable editor plus live Approve/Reject. Locking the editor for `current` and showing this banner are both deferred.
- **"Worker is still processing this ingest. Reload to check again."** in the editor pane for a `pending`/`processing` source — today a draft-less source renders the generic no-draft message.

## Live ingest cost in the provenance footer

The provenance footer renders `source.totalCostUsd`, but that value is always `0` today: food's local `ai_inference_log` table was dropped when telemetry moved to the `ai` pillar via `@pops/ai-telemetry` (#3490), so `readInferenceLogs` returns an empty set and `inferenceLogs` is `[]`. Wiring a real per-source cost rollup means querying the `ai` pillar's telemetry by a stable context ref (e.g. `ingest_source:<id>`) through the SDK and surfacing the sum + per-call breakdown the footer was designed for.

## Server-side aggregate test

`getInspectorView` is covered indirectly (the RTL `InspectorPage.test.tsx` mocks the wire shape), but there is no Vitest integration test exercising the real `getForReview` service end-to-end against a seeded DB: full shape per ingest kind, `draft: null` for draft-less sources, and the `rejection` row for archived/rejected versions. Worth adding to lock the aggregate's contract.
