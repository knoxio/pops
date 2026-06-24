/**
 * Maps a shell module id to the pillar id that owns its backend (ADR-026 P3).
 *
 * Every module currently resolves to the platform `registry` pillar (the
 * discovery / settings host). To route a module's health at its own pillar,
 * special-case its id here.
 */

/** The canonical platform-pillar id, shared with the `registry` pillar's `/health` response. */
export const REGISTRY_PILLAR_ID = 'registry';

/**
 * Returns the pillar id that owns the backend for a given module id.
 *
 * Module ids without a dedicated mapping resolve to the platform `registry`
 * pillar.
 */
export function pillarIdForModule(_moduleId: string): string {
  return REGISTRY_PILLAR_ID;
}
