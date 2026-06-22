import { describe, expect, it } from 'vitest';

import { coreOperationalManifest } from '../settings/index.js';

describe('@pops/core-contract/settings', () => {
  it('exposes coreOperationalManifest with the expected id', () => {
    expect(coreOperationalManifest.id).toBe('core.operational');
  });
});
