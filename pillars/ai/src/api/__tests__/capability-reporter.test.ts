/**
 * Capability-reporter regression guard (P2 settings federation). The ai pillar
 * must advertise `settings: true` on its registry heartbeat so the shell's
 * live-registry settings discovery routes ai settings to ai's own federated
 * `/settings/*` surface instead of the registry fallback. Drop this flag and
 * the federated surface silently goes dormant.
 */
import { describe, expect, it } from 'vitest';

import { buildAiCapabilityReporter } from '../ai-manifest.js';

describe('buildAiCapabilityReporter', () => {
  it('reports settings: true so the shell routes settings to ai', () => {
    expect(buildAiCapabilityReporter()()).toEqual({ settings: true });
  });
});
