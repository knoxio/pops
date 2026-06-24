/**
 * Cerebrum domain table barrel — canonical definitions for the
 * cerebrum-owned tables.
 *
 * Exposes:
 *   - `nudgeLog` — reflex/nudge audit trail.
 *   - `engramIndex` / `engramScopes` / `engramTags` / `engramLinks` —
 *     atomic memory units + their graph edges.
 *   - `gliaActions` / `gliaTrustState` — autonomous-action proposals +
 *     per-type trust graduation state (ADR-021).
 *   - `conversations` / `messages` / `conversationContext` —
 *     chat-with-cerebrum sessions, append-only message stream, and the
 *     conversation → engram junction table.
 *   - `plexusAdapters` / `plexusFilters` — external adapter registry +
 *     per-adapter ingestion filter rules.
 *   - `embeddings` — dense-vector metadata table (one row per content
 *     chunk). The companion `embeddings_vec` virtual table (sqlite-vec
 *     `vec0`) is created imperatively in `openCerebrumDb` when the
 *     extension is available; it has no drizzle table object because
 *     virtual tables cannot be represented in the schema builder.
 *   - `debriefSessions` / `debriefResults` / `debriefStatus` —
 *     post-watch reflection. The `watch_history_id` / `dimension_id` /
 *     `comparison_id` columns are soft pointers into the media pillar
 *     resolved via the URI dispatcher (ADR-026); `media_type` +
 *     `media_id` carry the denormalised media tuple so `getDebriefByMedia`
 *     reads without joining media.
 *   - `reflexExecutions` — reflex execution log.
 *   - `settings` — cerebrum-scoped key/value settings.
 */
export { embeddings } from './schema/core/embeddings.js';
export { debriefResults } from './schema/debrief-results.js';
export { debriefSessions } from './schema/debrief-sessions.js';
export { debriefStatus } from './schema/debrief-status.js';
export { conversationContext, conversations, messages } from './schema/ego.js';
export { engramIndex, engramLinks, engramScopes, engramTags } from './schema/engrams.js';
export { gliaActions, gliaTrustState } from './schema/glia.js';
export { nudgeLog } from './schema/nudge-log.js';
export { plexusAdapters, plexusFilters } from './schema/plexus.js';
export { reflexExecutions } from './schema/reflex-executions.js';
export { settings } from './schema/settings.js';
