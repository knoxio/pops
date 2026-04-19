import type { SettingsManifest } from '@pops/types';

export class SettingsRegistry {
  private manifests = new Map<string, SettingsManifest>();

  register(manifest: SettingsManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(
        `Settings manifest "${manifest.id}" is already registered — duplicate registration is not allowed`
      );
    }

    // Build occupied keys from already-registered manifests
    const occupiedKeys = new Map<string, string>();
    for (const [existingId, m] of this.manifests) {
      for (const group of m.groups) {
        for (const field of group.fields) {
          occupiedKeys.set(field.key, existingId);
        }
      }
    }

    // Check for duplicate keys within this manifest and against existing manifests
    const seenInManifest = new Set<string>();
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (seenInManifest.has(field.key)) {
          throw new Error(
            `Settings key "${field.key}" appears more than once within manifest "${manifest.id}"`
          );
        }
        seenInManifest.add(field.key);
        const claimant = occupiedKeys.get(field.key);
        if (claimant) {
          throw new Error(
            `Settings key "${field.key}" already registered by "${claimant}" — cannot register again in "${manifest.id}"`
          );
        }
      }
    }

    this.manifests.set(manifest.id, manifest);
  }

  getAll(): SettingsManifest[] {
    return [...this.manifests.values()].toSorted((a, b) => a.order - b.order);
  }

  clear(): void {
    this.manifests.clear();
  }
}

export const settingsRegistry = new SettingsRegistry();
