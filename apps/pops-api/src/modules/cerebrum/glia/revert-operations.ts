/**
 * Revert operations for glia actions (PRD-086 US-04, #2576).
 *
 * Implements full file-level revert for prune/consolidate/link action types:
 *
 * - prune: moves `.archive/{type}/{id}.md` back to `{type}/{id}.md` and flips
 *   the index row status to `active`.
 * - consolidate: deletes the merged engram (file, index, inbound link
 *   frontmatter references), then restores every source engram from
 *   `.archive/` back to its original path.
 * - link: removes the bidirectional link recorded in the action payload.
 *
 * Every operation is idempotent — re-reverting an already-reverted action
 * succeeds as a no-op.
 */
import { logger } from '../../../lib/logger.js';

import type { EngramService } from '../engrams/service.js';
import type { ConsolidatePayload, LinkPayload } from '../workers/types.js';
import type { GliaAction } from './types.js';

/** Result of a revert operation. */
export interface RevertResult {
  success: boolean;
  restoredIds: string[];
  errors: string[];
}

/**
 * Execute the domain-specific revert logic for a glia action.
 * Called after the action has been marked as reverted in the DB.
 */
export function executeRevert(action: GliaAction, engramService: EngramService): RevertResult {
  switch (action.actionType) {
    case 'prune':
      return revertPrune(action, engramService);
    case 'consolidate':
      return revertConsolidate(action, engramService);
    case 'link':
      return revertLink(action, engramService);
    case 'audit':
      return { success: true, restoredIds: [], errors: [] };
  }
}

/** Revert a prune action: move every archived engram back to its type folder. */
function revertPrune(action: GliaAction, engramService: EngramService): RevertResult {
  const restoredIds: string[] = [];
  const errors: string[] = [];

  for (const id of action.affectedIds) {
    try {
      if (!engramService.exists(id)) {
        // Idempotency: source has been removed entirely — nothing to restore.
        continue;
      }
      const { result } = engramService.restore(id);
      if (result.moved) restoredIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${id}: ${msg}`);
      logger.warn({ engramId: id, error: msg }, '[RevertOps] Prune revert failed');
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/**
 * Revert a consolidate action: delete the merged engram and restore all
 * archived source engrams. The merged engram ID is read from
 * `payload.mergedEngramId`, which the consolidator records at execution time.
 */
function revertConsolidate(action: GliaAction, engramService: EngramService): RevertResult {
  const restoredIds: string[] = [];
  const errors: string[] = [];
  const payload = action.payload as ConsolidatePayload | null;

  const mergedId = payload?.mergedEngramId;
  if (mergedId) {
    try {
      engramService.hardDelete(mergedId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to delete merged engram ${mergedId}: ${msg}`);
      logger.warn(
        { mergedId, error: msg },
        '[RevertOps] Consolidate revert: merged engram delete failed'
      );
    }
  }

  for (const id of action.affectedIds) {
    try {
      if (!engramService.exists(id)) continue;
      const { result } = engramService.restore(id);
      if (result.moved) restoredIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${id}: ${msg}`);
      logger.warn({ engramId: id, error: msg }, '[RevertOps] Consolidate revert: restore failed');
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/**
 * Revert a link action: remove the bidirectional link recorded in the payload.
 * Falls back to the first two `affectedIds` when the payload is missing the
 * pair (older proposals before LinkPayload was wired up).
 *
 * Idempotent — re-running on an already-unlinked pair succeeds (the engram
 * service strips a non-existent entry without throwing).
 */
function revertLink(action: GliaAction, engramService: EngramService): RevertResult {
  const errors: string[] = [];
  const payload = action.payload as Partial<LinkPayload> | null;
  const pair = resolveLinkPair(action, payload);
  if (!pair) {
    return {
      success: false,
      restoredIds: [],
      errors: ['Link revert requires payload.sourceId/targetId or two affectedIds'],
    };
  }

  try {
    if (!engramService.exists(pair.sourceId)) {
      return { success: true, restoredIds: [], errors: [] };
    }
    engramService.unlink(pair.sourceId, pair.targetId);
    return { success: true, restoredIds: [], errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to unlink: ${msg}`);
    logger.warn({ ...pair, error: msg }, '[RevertOps] Link revert failed');
  }

  return { success: false, restoredIds: [], errors };
}

function resolveLinkPair(
  action: GliaAction,
  payload: Partial<LinkPayload> | null
): { sourceId: string; targetId: string } | null {
  if (payload?.sourceId && payload?.targetId) {
    return { sourceId: payload.sourceId, targetId: payload.targetId };
  }
  const [first, second] = action.affectedIds;
  if (first && second) return { sourceId: first, targetId: second };
  return null;
}
