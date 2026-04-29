import type { FeatureManifest } from '@pops/types';

/**
 * Process-wide registry of feature manifests. Each module registers its
 * manifest at startup; duplicates (manifest IDs or feature keys) are rejected
 * with a descriptive error so that conflicts surface immediately.
 *
 * Mirrors the SettingsRegistry contract from PRD-093.
 */
export class FeaturesRegistry {
  private manifests = new Map<string, FeatureManifest>();

  register(manifest: FeatureManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(
        `Feature manifest "${manifest.id}" is already registered — duplicate registration is not allowed`
      );
    }

    const occupiedKeys = new Map<string, string>();
    for (const [existingId, m] of this.manifests) {
      for (const feature of m.features) {
        occupiedKeys.set(feature.key, existingId);
      }
    }

    const seenInManifest = new Set<string>();
    for (const feature of manifest.features) {
      if (seenInManifest.has(feature.key)) {
        throw new Error(
          `Feature key "${feature.key}" appears more than once within manifest "${manifest.id}"`
        );
      }
      seenInManifest.add(feature.key);
      const claimant = occupiedKeys.get(feature.key);
      if (claimant) {
        throw new Error(
          `Feature key "${feature.key}" already registered by "${claimant}" — cannot register again in "${manifest.id}"`
        );
      }
    }

    this.manifests.set(manifest.id, manifest);
  }

  getAll(): FeatureManifest[] {
    return [...this.manifests.values()].toSorted((a, b) => a.order - b.order);
  }

  getFeature(
    key: string
  ): { manifest: FeatureManifest; feature: FeatureManifest['features'][number] } | null {
    for (const manifest of this.manifests.values()) {
      const feature = manifest.features.find((f) => f.key === key);
      if (feature) return { manifest, feature };
    }
    return null;
  }

  clear(): void {
    this.manifests.clear();
  }
}

export const featuresRegistry = new FeaturesRegistry();
