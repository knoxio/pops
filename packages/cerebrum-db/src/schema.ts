/**
 * Local re-export of cerebrum-domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so the
 * cerebrum pillar's read surface stays self-describing. Mirrors the
 * `@pops/core-db` / `@pops/inventory-db` schema re-export pattern.
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
 *
 * Downstream slices (embeddings) will add their tables here as their
 * service code lands.
 */
export { engramIndex, engramLinks, engramScopes, engramTags, nudgeLog } from '@pops/db-types';
export {
  conversationContext,
  conversations,
  gliaActions,
  gliaTrustState,
  messages,
  plexusAdapters,
  plexusFilters,
} from '@pops/db-types/schema';
