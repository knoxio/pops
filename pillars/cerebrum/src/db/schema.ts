/**
 * Cerebrum domain table barrel.
 *
 * Canonical definitions for cerebrum-owned tables (debrief sessions /
 * status / results, engrams + scopes + tags + links, conversations +
 * messages + conversation_context, glia actions + trust state, plexus
 * adapters + filters, nudge_log, reflex_executions, embeddings) live
 * in this package per PRD-245 US-01 (audit H6/H7).
 *
 *
 * Currently exposes:
 *   - `nudgeLog` — PRD-084 reflex/nudge audit trail.
 *   - `engramIndex` / `engramScopes` / `engramTags` / `engramLinks` —
 *     PRD-179 atomic memory units + their graph edges.
 *   - `gliaActions` / `gliaTrustState` — PRD-181 autonomous-action
 *     proposals + per-type trust graduation state (ADR-021 / PRD-086).
 *   - `conversations` / `messages` / `conversationContext` — PRD-182
 *     chat-with-cerebrum sessions, append-only message stream, and the
 *     conversation → engram junction table.
 *   - `plexusAdapters` / `plexusFilters` — PRD-180 external adapter
 *     registry + per-adapter ingestion filter rules (PRD-090).
 *   - `embeddings` — PRD-076 dense-vector metadata table (one row per
 *     content chunk). The companion `embeddings_vec` virtual table
 *     (sqlite-vec `vec0`) is created imperatively in `openCerebrumDb`
 *     when the extension is available; it has no drizzle table object
 *     because virtual tables cannot be represented in the schema
 *     builder.
 *   - `debriefSessions` / `debriefResults` / `debriefStatus` — Theme-13
 *     Wave 5 debrief slice (post-watch reflection, see
 *     `0055_debrief_baseline.sql`). The cross-pillar `watch_history_id`
 *     / `dimension_id` / `comparison_id` references are soft pointers
 *     into the media pillar resolved via the URI dispatcher (ADR-026);
 *     `media_type` + `media_id` carry the denormalised media tuple per
 *     PR #3119 so the `getDebriefByMedia` read no longer joins media.
 *   - `reflexExecutions` — PRD-089 reflex execution log.
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
