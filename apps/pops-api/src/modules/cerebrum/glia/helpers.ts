/**
 * Glia shared helpers — ID generation.
 *
 * PRD-181 PR 3 collapsed serialization + query helpers into the
 * `@pops/cerebrum-db` `gliaService` namespace once writes flipped onto
 * the cerebrum pillar handle. Only ID generation stays in pops-api —
 * it owns the public ID shape and has no DB dependency.
 */
import type { ActionType } from './types.js';

/** Generate a unique action ID. */
export function generateActionId(actionType: ActionType, timestamp: string): string {
  const hash = Math.random().toString(36).substring(2, 10);
  const ts = timestamp.replace(/[^0-9]/g, '').substring(0, 14);
  return `glia_${actionType}_${ts}_${hash}`;
}
