/**
 * localStorage persistence for the per-location collapse state. The
 * key is versioned (`.v1`) so a future schema change can migrate.
 */
import type { BatchLocation } from '../../food-api-shared-types.js';

const STORAGE_KEY = 'fridge.collapsed-locations.v1';

function isBatchLocation(v: unknown): v is BatchLocation {
  return v === 'pantry' || v === 'fridge' || v === 'freezer' || v === 'other';
}

export function loadCollapsed(): Set<BatchLocation> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isBatchLocation));
  } catch {
    return new Set();
  }
}

export function saveCollapsed(collapsed: ReadonlySet<BatchLocation>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Storage may be unavailable (private browsing); silently ignore.
  }
}
