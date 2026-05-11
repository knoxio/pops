/**
 * Pure formatting helpers for the Plexus surface — shared between the list
 * row, the detail header and the future widget surfaces.
 */
import type { PlexusAdapterStatus } from './types';

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 16);
  } catch {
    return iso;
  }
}

export function statusBadgeVariant(
  status: PlexusAdapterStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'healthy':
      return 'default';
    case 'error':
      return 'destructive';
    case 'degraded':
    case 'initializing':
      return 'outline';
    case 'shutdown':
    case 'registered':
    default:
      return 'secondary';
  }
}

export function statusKey(status: PlexusAdapterStatus): string {
  return `plexus.status.${status}`;
}
