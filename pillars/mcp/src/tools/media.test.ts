import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarMedia,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { mediaTools } = await import('./media.js');

const library = mockPillarMedia.media.library;
const watchlist = mockPillarMedia.media.watchlist;

beforeEach(() => {
  vi.clearAllMocks();
  library.list.mockResolvedValue(callOk({ items: [], total: 0 }));
  watchlist.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
});

describe('media.library.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.library.list')!;

  it('defaults type to "all" when not provided', async () => {
    await tool.handler({});
    expect(library.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'all' }));
  });

  it('passes movie filter through', async () => {
    await tool.handler({ type: 'movie', search: 'godfather' });
    expect(library.list).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'movie', search: 'godfather' })
    );
  });

  it('ignores invalid type values and falls back to "all"', async () => {
    await tool.handler({ type: 'podcast' });
    expect(library.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'all' }));
  });

  it('returns isError on unavailable', async () => {
    library.list.mockResolvedValueOnce(callUnavailable('media'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    library.list.mockResolvedValueOnce(callContractMismatch('media', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('media.watchlist.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.watchlist.list')!;

  it('passes mediaType filter', async () => {
    await tool.handler({ mediaType: 'movie' });
    expect(watchlist.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'movie' }));
  });

  it('ignores invalid mediaType values', async () => {
    await tool.handler({ mediaType: 'podcast' });
    const call = watchlist.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['mediaType']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    watchlist.list.mockResolvedValueOnce(callUnavailable('media'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});
