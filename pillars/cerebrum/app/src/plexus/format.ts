/**
 * Plexus-surface formatting helpers — status → variant/key mapping. The
 * generic timestamp formatter lives in `../utils/format` and is
 * re-exported here so existing imports (`../plexus/format`) keep working.
 */
import type { PlexusAdapterStatus } from './types';

export { formatTimestamp } from '../utils/format';

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
