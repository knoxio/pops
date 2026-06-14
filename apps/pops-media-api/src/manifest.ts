/**
 * Media pillar manifest payload.
 *
 * Theme 13 PRD-158 introduced the registry handshake; this file is the
 * hand-rolled payload the media-api hands to `bootstrapPillar` at boot
 * (PRD-155 will generate it later from the contract).
 *
 * PRD-240 US-03 adds the `settings.manifests` block — each per-pillar
 * API contributes its own settings UI descriptors next to
 * `search.adapters` / `ai.tools` / `sinks`. The four media manifests
 * (`arr`, `plex`, `rotation`, `media-operational`) flow in from the
 * `@pops/media-contract/settings` subpath rather than the legacy
 * `@pops/module-registry/settings` or static `@pops/pillar-sdk/settings`
 * barrels.
 */
import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '@pops/media-contract/settings';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const MEDIA_PILLAR_ID = 'media' as const;

export function buildMediaManifest(version: string): ManifestPayload {
  return {
    pillar: MEDIA_PILLAR_ID,
    version,
    contract: {
      package: '@pops/media-contract',
      version,
      tag: `contract-media@v${version}`,
    },
    routes: {
      queries: [
        'media.shelfImpressions.getRecentImpressions',
        'media.shelfImpressions.getShelfFreshness',
      ],
      mutations: ['media.shelfImpressions.recordImpressions', 'media.shelfImpressions.cleanup'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: {
      manifests: [arrManifest, plexManifest, rotationManifest, mediaOperationalManifest],
    },
    healthcheck: { path: '/health' },
  };
}
