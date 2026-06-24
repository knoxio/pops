import type { FeatureCredentialStatus } from '@pops/types';

/**
 * Thrown when `isEnabled()` (or any sibling resolver) is called with a key
 * that no registered pillar declares in its manifest `features` slot. The
 * message names the offending key and lists the pillar ids whose manifests
 * were searched (in registry order), so operators can tell whether the call
 * site is using a stale key or whether the owning pillar is not yet
 * registered.
 *
 * Throwing (rather than returning a silent `false`) is intentional
 * (feature-toggles-framework): a key not declared by any registered pillar is
 * a bug.
 */
export class FeatureNotFoundError extends Error {
  public readonly key: string;
  public readonly searched: readonly string[];

  constructor(key: string, searched: readonly string[] = []) {
    const list = searched.length === 0 ? '<none>' : searched.join(', ');
    super(`Unknown feature "${key}" — not declared by any registered pillar (searched: ${list})`);
    this.name = 'FeatureNotFoundError';
    this.key = key;
    this.searched = searched;
  }
}

/**
 * Thrown by `setFeatureEnabled` when the caller tries to enable a feature
 * whose gating (capability probe or required credentials) is currently
 * failing. Carries the unmet credentials so the caller can surface them.
 */
export class FeatureGateError extends Error {
  constructor(
    public readonly key: string,
    public readonly missing: FeatureCredentialStatus[]
  ) {
    super(
      `Feature "${key}" cannot be enabled — missing: ${missing
        .map((m) => m.envVar ?? m.key)
        .join(', ')}`
    );
    this.name = 'FeatureGateError';
  }
}

/**
 * Thrown when a write targets a feature whose `scope` forbids it — e.g.
 * `setFeatureEnabled` on a `capability` feature, or `setUserPreference` on a
 * `system` feature.
 */
export class FeatureScopeError extends Error {
  constructor(key: string, expected: string, actual: string) {
    super(`Feature "${key}" has scope "${actual}", expected "${expected}"`);
    this.name = 'FeatureScopeError';
  }
}
