/**
 * Glia shared helpers — action ID generation.
 *
 * Owns the public ID shape (`glia_{type}_{timestamp}_{hash}`) and has no DB
 * dependency, so it stays in the orchestration module rather than the
 * data-access package.
 */
import type { ActionType } from './types.js';

/** Generate a unique action ID. */
export function generateActionId(actionType: ActionType, timestamp: string): string {
  const hash = Math.random().toString(36).substring(2, 10);
  const ts = timestamp.replace(/[^0-9]/g, '').substring(0, 14);
  return `glia_${actionType}_${ts}_${hash}`;
}
