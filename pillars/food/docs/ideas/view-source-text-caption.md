# Idea: View-Source dialog renders the actual text caption

The inbox `ViewSourceDialog` renders the original ingest input read-only. The `screenshot` and `url-*` kinds work fully: screenshot streams from `GET /ingest/source/:sourceId/screenshot`, and URLs render as a link plus a sandboxed iframe. The **`text`** kind, however, renders a static `<pre>` stub (an `inbox.failed.viewSource.textPlaceholder` copy explaining how to inspect) instead of the saved `ingest_sources.caption`.

## Build later

Show the real pasted text:

- Expose the caption to the dialog. Two options:
  - Add a tiny read endpoint, e.g. `GET /ingest/source/:sourceId/text → { caption: string | null }` (parallels the screenshot/video media endpoints, fails closed with `404` when the source is missing/archived), and fetch it when the dialog opens for a `text` kind.
  - Or include `caption` on the `FailedRow` / draft-row payloads so the dialog renders it without a second round-trip (heavier list responses; only worth it if the caption is short).
- Render the fetched caption in the existing `<pre className="whitespace-pre-wrap">`; keep the placeholder only as the empty/404 fallback.

## Why deferred

Text ingests are the easiest to reason about (the user pasted the text themselves), so the missing inline preview is low-impact. The screenshot and URL paths — where the original input is genuinely opaque to the user — are the ones that mattered and they shipped.
