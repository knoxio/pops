import { describe, expect, it } from 'vitest';

import { aiConfigManifest, coreOperationalManifest } from '../settings/index.js';

describe('@pops/core-contract/settings', () => {
  it('exposes aiConfigManifest with the expected id', () => {
    expect(aiConfigManifest.id).toBe('ai.config');
  });

  it('exposes coreOperationalManifest with the expected id', () => {
    expect(coreOperationalManifest.id).toBe('core.operational');
  });
});
