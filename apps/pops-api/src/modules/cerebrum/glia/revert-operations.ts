/**
 * Revert operations for glia actions (#2248).
 *
 * Implements revertAction logic for prune/consolidate/link action types.
 * Restores engrams from archived/consolidated state.
 */
import { logger } from '../../../lib/logger.js';

import type { EngramService } from '../engrams/service.js';
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

/** Revert a prune action: restore archived engrams to active. */
function revertPrune(action: GliaAction, engramService: EngramService): RevertResult {
  const restoredIds: string[] = [];
  const errors: string[] = [];

  for (const id of action.affectedIds) {
    try {
      engramService.update(id, { status: 'active' });
      restoredIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${id}: ${msg}`);
      logger.warn({ engramId: id, error: msg }, '[RevertOps] Prune revert failed');
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/** Revert a consolidate action: restore consolidated engrams to active. */
function revertConsolidate(action: GliaAction, engramService: EngramService): RevertResult {
  const restoredIds: string[] = [];
  const errors: string[] = [];

  for (const id of action.affectedIds) {
    try {
      engramService.update(id, { status: 'active' });
      restoredIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${id}: ${msg}`);
      logger.warn({ engramId: id, error: msg }, '[RevertOps] Consolidate revert failed');
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/** Revert a link action: remove the link between the affected engrams. */
function revertLink(action: GliaAction, engramService: EngramService): RevertResult {
  const errors: string[] = [];
  const payload = action.payload as { sourceId?: string; targetId?: string } | null;

  if (payload?.sourceId && payload?.targetId) {
    try {
      engramService.unlink(payload.sourceId, payload.targetId);
      return { success: true, restoredIds: [], errors: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to unlink: ${msg}`);
    }
  } else if (action.affectedIds.length >= 2) {
    // Fallback: unlink first two affected IDs
    const srcId = action.affectedIds[0];
    const tgtId = action.affectedIds[1];
    if (srcId && tgtId) {
      try {
        engramService.unlink(srcId, tgtId);
        return { success: true, restoredIds: [], errors: [] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to unlink: ${msg}`);
      }
    }
  }

  return { success: errors.length === 0, restoredIds: [], errors };
}
