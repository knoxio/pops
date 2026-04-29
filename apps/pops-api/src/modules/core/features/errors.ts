import type { FeatureCredentialStatus } from '@pops/types';

export class FeatureNotFoundError extends Error {
  constructor(key: string) {
    super(`Unknown feature "${key}"`);
    this.name = 'FeatureNotFoundError';
  }
}

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

export class FeatureScopeError extends Error {
  constructor(key: string, expected: string, actual: string) {
    super(`Feature "${key}" has scope "${actual}", expected "${expected}"`);
    this.name = 'FeatureScopeError';
  }
}
