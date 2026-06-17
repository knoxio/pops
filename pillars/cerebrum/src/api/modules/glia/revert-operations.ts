/**
 * Revert operations for glia actions (PRD-086 US-04, #2576).
 *
 * Implements file-level revert for prune/consolidate/link action types over
 * the in-pillar {@link EngramService}:
 *
 *   - prune: restore every archived engram (`.archive/{type}/{id}.md` →
 *     `{type}/{id}.md`).
 *   - consolidate: delete the merged engram, then restore every source engram.
 *   - link: remove the bidirectional link recorded in the action payload.
 *   - audit: informational — no-op.
 *
 * Every operation is idempotent — re-reverting an already-reverted action
 * succeeds as a no-op.
 *
 * The minimal payload shapes are declared locally rather than importing the
 * worker payload types from pops-api: revert only reads `mergedEngramId` (for
 * consolidate) and `sourceId`/`targetId` (for link), and the worker module is
 * not part of this pillar slice.
 */
import type { EngramService } from '../engrams/service.js';
import type { GliaAction } from './types.js';

/** Result of a revert operation. */
export interface RevertResult {
  success: boolean;
  restoredIds: string[];
  errors: string[];
}

/** Fields revert reads from a consolidate action's payload. */
interface ConsolidateRevertPayload {
  mergedEngramId?: string;
}

/** Fields revert reads from a link action's payload. */
interface LinkRevertPayload {
  sourceId?: string;
  targetId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Execute the domain-specific revert logic for a glia action. Called after the
 * action has been marked as reverted in the DB.
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
      if (!engramService.exists(id)) continue;
      const { result } = engramService.restore(id);
      if (result.moved) restoredIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${id}: ${msg}`);
      console.warn(`[glia/revert] Prune revert failed for ${id}: ${msg}`);
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/**
 * Revert a consolidate action: delete the merged engram and restore all
 * archived source engrams. The merged engram ID is read from
 * `payload.mergedEngramId`, recorded by the consolidator at execution time.
 */
function revertConsolidate(action: GliaAction, engramService: EngramService): RevertResult {
  const restoredIds: string[] = [];
  const errors: string[] = [];
  const payload: ConsolidateRevertPayload | null = isRecord(action.payload)
    ? { mergedEngramId: readString(action.payload, 'mergedEngramId') }
    : null;

  const mergedId = payload?.mergedEngramId;
  if (mergedId) {
    try {
      engramService.hardDelete(mergedId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to delete merged engram ${mergedId}: ${msg}`);
      console.warn(
        `[glia/revert] Consolidate revert: merged delete failed for ${mergedId}: ${msg}`
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
      console.warn(`[glia/revert] Consolidate revert: restore failed for ${id}: ${msg}`);
    }
  }

  return { success: errors.length === 0, restoredIds, errors };
}

/**
 * Revert a link action: remove the bidirectional link recorded in the payload.
 * Falls back to the first two `affectedIds` when the payload lacks the pair
 * (older proposals before the link payload was wired up). Idempotent.
 */
function revertLink(action: GliaAction, engramService: EngramService): RevertResult {
  const errors: string[] = [];
  const payload: LinkRevertPayload | null = isRecord(action.payload)
    ? {
        sourceId: readString(action.payload, 'sourceId'),
        targetId: readString(action.payload, 'targetId'),
      }
    : null;
  const pair = resolveLinkPair(action, payload);
  if (!pair) {
    return {
      success: false,
      restoredIds: [],
      errors: ['Link revert requires payload.sourceId/targetId or two affectedIds'],
    };
  }

  try {
    // Idempotency: either side missing means the link can no longer exist.
    if (!engramService.exists(pair.sourceId) || !engramService.exists(pair.targetId)) {
      return { success: true, restoredIds: [], errors: [] };
    }
    engramService.unlink(pair.sourceId, pair.targetId);
    return { success: true, restoredIds: [], errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to unlink: ${msg}`);
    console.warn(`[glia/revert] Link revert failed: ${msg}`);
  }

  return { success: false, restoredIds: [], errors };
}

function resolveLinkPair(
  action: GliaAction,
  payload: LinkRevertPayload | null
): { sourceId: string; targetId: string } | null {
  if (payload?.sourceId && payload?.targetId) {
    return { sourceId: payload.sourceId, targetId: payload.targetId };
  }
  const [first, second] = action.affectedIds;
  if (first && second) return { sourceId: first, targetId: second };
  return null;
}
