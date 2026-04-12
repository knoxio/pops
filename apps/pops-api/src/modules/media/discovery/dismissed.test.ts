import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { createCaller } from '../../../shared/test-utils.js';
import { setupTestContext } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  ({ caller } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('dismissed discover', () => {
  it('dismiss inserts a tmdbId', async () => {
    await caller.media.discovery.dismiss({ tmdbId: 550 });
    const result = await caller.media.discovery.getDismissed();
    expect(result.data).toContain(550);
  });

  it('dismiss is idempotent (no error on duplicate)', async () => {
    await caller.media.discovery.dismiss({ tmdbId: 550 });
    await caller.media.discovery.dismiss({ tmdbId: 550 });
    const result = await caller.media.discovery.getDismissed();
    expect(result.data.filter((id: number) => id === 550)).toHaveLength(1);
  });

  it('undismiss removes a tmdbId', async () => {
    await caller.media.discovery.dismiss({ tmdbId: 550 });
    await caller.media.discovery.undismiss({ tmdbId: 550 });
    const result = await caller.media.discovery.getDismissed();
    expect(result.data).not.toContain(550);
  });

  it('undismiss is safe when tmdbId not present', async () => {
    await caller.media.discovery.undismiss({ tmdbId: 999 });
    const result = await caller.media.discovery.getDismissed();
    expect(result.data).toEqual([]);
  });

  it('getDismissed returns correct set of tmdbIds', async () => {
    await caller.media.discovery.dismiss({ tmdbId: 100 });
    await caller.media.discovery.dismiss({ tmdbId: 200 });
    await caller.media.discovery.dismiss({ tmdbId: 300 });
    await caller.media.discovery.undismiss({ tmdbId: 200 });

    const result = await caller.media.discovery.getDismissed();
    expect(result.data).toHaveLength(2);
    expect(result.data).toContain(100);
    expect(result.data).toContain(300);
    expect(result.data).not.toContain(200);
  });
});
