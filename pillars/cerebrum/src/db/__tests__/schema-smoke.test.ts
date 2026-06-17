/**
 * Smoke test that the relocated cerebrum schemas (PRD-245 US-01 /
 * audit H6) resolve from `@pops/cerebrum-db` with the expected
 * drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-01-relocate-cerebrum-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  conversationContext,
  conversations,
  debriefResults,
  debriefSessions,
  debriefStatus,
  embeddings,
  engramIndex,
  engramLinks,
  engramScopes,
  engramTags,
  gliaActions,
  gliaTrustState,
  messages,
  nudgeLog,
  plexusAdapters,
  plexusFilters,
  reflexExecutions,
} from '../schema.js';

describe('PRD-245 US-01 cerebrum schema relocation', () => {
  it.each([
    [debriefSessions, 'debrief_sessions'],
    [debriefResults, 'debrief_results'],
    [debriefStatus, 'debrief_status'],
    [engramIndex, 'engram_index'],
    [engramScopes, 'engram_scopes'],
    [engramTags, 'engram_tags'],
    [engramLinks, 'engram_links'],
    [gliaActions, 'glia_actions'],
    [gliaTrustState, 'glia_trust_state'],
    [conversations, 'conversations'],
    [messages, 'messages'],
    [conversationContext, 'conversation_context'],
    [plexusAdapters, 'plexus_adapters'],
    [plexusFilters, 'plexus_filters'],
    [nudgeLog, 'nudge_log'],
    [reflexExecutions, 'reflex_executions'],
    [embeddings, 'embeddings'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
