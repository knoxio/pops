/**
 * Capability-reporter regression guard (P2 settings federation). The media
 * pillar must advertise `settings: true` on its registry heartbeat so the
 * shell's live-registry settings discovery routes media settings to media's
 * own federated `/settings/*` surface instead of the registry fallback. Drop
 * this flag and the federated surface silently goes dormant.
 */
import { describe, expect, it } from 'vitest';

import { buildMediaCapabilityReporter } from '../manifest.js';

describe('buildMediaCapabilityReporter', () => {
  it('reports settings: true so the shell routes settings to media', () => {
    expect(buildMediaCapabilityReporter()()).toEqual({ settings: true });
  });
});
