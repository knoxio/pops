import type { FeatureManifest, FeatureStatus } from '@pops/types';

/** Feature statuses grouped by their manifest, used by the Features page renderer. */
export interface FeaturesByManifest {
  manifest: FeatureManifest;
  statuses: FeatureStatus[];
}
