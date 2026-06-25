# Debrief consumers — wire up the post-watch reflection flow

The cerebrum [debrief surface](../prds/debrief.md) ships in full — the `debrief.*` contract, the `debrief_sessions` / `debrief_results` / `debrief_status` tables, and unit coverage — but nothing consumes it. No pillar calls `pillar('cerebrum').debrief.*` and no UI drives a session through `create → record → dismiss`. The feature is dormant; the surface exists so a consumer can be wired up later without re-deriving the shape.

## What's missing

A media-side flow that turns a finished watch into a reflection prompt and feeds the answers back:

- **On watch completion**, fire `debrief.logWatchCompletion({ watchHistoryId, mediaType, mediaId })` after the media pillar commits its own watch transaction. The call is idempotent on re-watch, so a best-effort post-commit fire is safe: a failure is logged and self-heals on the next completion for the same media. The watch is the source of truth; the debrief side-effect is reconstructible.
- **On the reflection screen**, read the pending session with `debrief.getByMedia({ mediaType, mediaId })` (or `getByItem`/`listPending`), record each per-dimension answer with `debrief.record({ sessionId, dimensionId, comparisonId })`, and `debrief.dismiss({ sessionId })` when the user finishes or skips.
- **On cleanup** (un-log, blacklist), call `debrief.deleteByWatchHistoryId({ watchHistoryId })` so debrief rows do not outlive the watch row they point at.

## Open questions to resolve before building

- **`dimensionsQueued` is always `0`.** `logWatchCompletion` cannot fan out a per-dimension status because the cerebrum container has no handle to the media pillar's `comparison_dimensions`. A real consumer must either resolve the dimensions media-side and seed `debrief_status` itself, or this stays a media-driven prompt with cerebrum recording only the answers. Decide which side owns the dimension list.
- **`debrief_status` is unexposed.** The per-(media, dimension) `debriefed` / `dismissed` flags live in cerebrum but have no contract endpoint. If the reflection UX needs "which dimensions are still outstanding for this media", the surface needs a read (and possibly a write) for `debrief_status`.
- **Error surfacing.** User-initiated calls (`record`, `dismiss`, `getByMedia`) should surface failures to the user; the side-effect-only `logWatchCompletion` should be logged-and-swallowed. The consumer must discriminate these.
