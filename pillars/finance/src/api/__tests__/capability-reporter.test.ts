/**
 * Capability-reporter regression guard (P2 settings federation). The finance
 * pillar must advertise `settings: true` on its registry heartbeat so the
 * shell's live-registry settings discovery routes finance settings to
 * finance's own federated `/settings/*` surface instead of the registry
 * fallback. Drop this flag and the federated surface silently goes dormant.
 */
import { describe, expect, it } from 'vitest';

import { buildFinanceCapabilityReporter } from '../manifest.js';

describe('buildFinanceCapabilityReporter', () => {
  it('reports settings: true so the shell routes settings to finance', () => {
    expect(buildFinanceCapabilityReporter()()).toEqual({ settings: true });
  });
});
