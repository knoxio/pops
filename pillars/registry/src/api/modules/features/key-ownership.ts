import type { FeatureManifestDescriptor } from '@pops/pillar-sdk';
/**
 * Feature-toggle key-ownership invariant (settings-federation S1, R10).
 *
 * Every system-scoped feature's effective storage key (`settingKey ?? key`)
 * is written to CORE's `settings` table through `setRawSetting`
 * (`setFeatureEnabled`) and read back from it. Once settings federate, a
 * feature key that belongs to a federated pillar would re-open the split-brain
 * the federation closes: core would write the toggle to its own table while the
 * owning pillar reads its own. The invariant: every such key MUST resolve to a
 * key in core's declared key set.
 *
 * User-scoped features persist under the `feature.`-prefixed `user_settings`
 * key space (never the shared `settings` table), and capability-scoped features
 * are read-only runtime probes that write no setting — both are exempt.
 *
 * Run at boot so a manifest that names a non-core key fails loudly instead of
 * silently writing a toggle the owning pillar never reads.
 */
import type { KeyDefaults } from '@pops/pillar-settings';

/** Thrown when a system-scoped feature's effective key is not core-owned. */
export class FeatureKeyOwnershipError extends Error {
  override readonly name = 'FeatureKeyOwnershipError';
  readonly offending: readonly { featureKey: string; settingKey: string }[];

  constructor(offending: readonly { featureKey: string; settingKey: string }[]) {
    const detail = offending.map((o) => `${o.featureKey}→${o.settingKey}`).join(', ');
    super(`system-scoped feature keys are not core-owned: ${detail}`);
    this.offending = offending;
  }
}

/**
 * Assert every system-scoped feature's effective storage key is a member of
 * core's declared key set. Throws {@link FeatureKeyOwnershipError} listing
 * every violation. A no-op for an all-compliant feature list.
 */
export function assertFeatureKeysAreCoreOwned(
  features: readonly FeatureManifestDescriptor[],
  coreKeyDefaults: KeyDefaults
): void {
  const coreKeys = new Set(coreKeyDefaults.keys);
  const offending: { featureKey: string; settingKey: string }[] = [];

  for (const feature of features) {
    if (feature.scope !== 'system') continue;
    const settingKey = feature.settingKey ?? feature.key;
    if (!coreKeys.has(settingKey)) {
      offending.push({ featureKey: feature.key, settingKey });
    }
  }

  if (offending.length > 0) throw new FeatureKeyOwnershipError(offending);
}
