/**
 * Image cache service tests — mocks fetch and filesystem.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageCacheService } from './image-cache.js';

vi.mock('node:fs/promises');

const IMAGES_DIR = '/data/media/images';
let service: ImageCacheService;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  service = new ImageCacheService(IMAGES_DIR);

  // Default: mkdir succeeds, stat throws (file doesn't exist), writeFile succeeds
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** Helper to create a mock fetch Response for binary data. */
function mockImageResponse(data = new ArrayBuffer(100), status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    arrayBuffer: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockImageResponse(data, status),
    body: null,
    bodyUsed: false,
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

describe('downloadMovieImages', () => {
  it('creates directory and downloads all three images', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadMovieImages(550, '/poster123.jpg', '/backdrop456.jpg', '/logo789.png');

    const movieDir = path.join(IMAGES_DIR, 'movies', '550');
    expect(fs.mkdir).toHaveBeenCalledWith(movieDir, { recursive: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fs.writeFile).toHaveBeenCalledTimes(3);

    // Verify correct TMDB URLs
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContainEqual('https://image.tmdb.org/t/p/w780/poster123.jpg');
    expect(urls).toContainEqual('https://image.tmdb.org/t/p/w1280/backdrop456.jpg');
    expect(urls).toContainEqual('https://image.tmdb.org/t/p/original/logo789.png');

    // Verify correct local paths
    const paths = vi.mocked(fs.writeFile).mock.calls.map((c) => c[0]);
    expect(paths).toContainEqual(path.join(movieDir, 'poster.jpg'));
    expect(paths).toContainEqual(path.join(movieDir, 'backdrop.jpg'));
    expect(paths).toContainEqual(path.join(movieDir, 'logo.png'));
  });

  it('skips null image paths', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadMovieImages(550, '/poster.jpg', null, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it('skips all downloads when all paths are null', async () => {
    await service.downloadMovieImages(550, null, null, null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();

    // Still creates the directory
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('skips download if file already exists', async () => {
    // First stat call (for poster) succeeds = file exists
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    await service.downloadMovieImages(550, '/poster.jpg', null, null);

    // Should not fetch or write since file exists
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('handles download failures gracefully without throwing', async () => {
    // Poster succeeds, backdrop fails
    fetchMock
      .mockResolvedValueOnce(mockImageResponse())
      .mockResolvedValueOnce(mockImageResponse(new ArrayBuffer(0), 404));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      service.downloadMovieImages(550, '/poster.jpg', '/backdrop.jpg', null)
    ).resolves.toBeUndefined();

    // Poster was written, backdrop was not (failed)
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0]![0]).toContain('[ImageCache]');

    consoleSpy.mockRestore();
  });

  it('handles network failures gracefully with retries', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadMovieImages(550, '/poster.jpg', null, null);
    await vi.advanceTimersByTimeAsync(500); // retry 1
    await vi.advanceTimersByTimeAsync(1000); // retry 2
    await promise;

    expect(fs.writeFile).not.toHaveBeenCalled();
    // 2 retry warnings + 1 final failure
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(consoleSpy.mock.calls[2]![0]).toContain('after 3 attempts');

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('getImagePath', () => {
  it('returns path when file exists', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    const result = await service.getImagePath('movie', 550, 'poster');

    expect(result).toBe(path.join(IMAGES_DIR, 'movies', '550', 'poster.jpg'));
  });

  it('returns null when file does not exist', async () => {
    vi.mocked(fs.stat).mockRejectedValueOnce(new Error('ENOENT'));

    const result = await service.getImagePath('movie', 550, 'poster');

    expect(result).toBeNull();
  });

  it('resolves correct paths for different image types', async () => {
    vi.mocked(fs.stat).mockResolvedValue({} as Awaited<ReturnType<typeof fs.stat>>);

    const poster = await service.getImagePath('movie', 550, 'poster');
    const backdrop = await service.getImagePath('movie', 550, 'backdrop');
    const logo = await service.getImagePath('movie', 550, 'logo');
    const override = await service.getImagePath('movie', 550, 'override');

    expect(poster).toContain('poster.jpg');
    expect(backdrop).toContain('backdrop.jpg');
    expect(logo).toContain('logo.png');
    expect(override).toContain('override.jpg');
  });
});

describe('deleteMovieImages', () => {
  it('removes the movie image directory', async () => {
    vi.mocked(fs.rm).mockResolvedValueOnce(undefined);

    await service.deleteMovieImages(550);

    expect(fs.rm).toHaveBeenCalledWith(path.join(IMAGES_DIR, 'movies', '550'), {
      recursive: true,
      force: true,
    });
  });
});

describe('downloadTvShowImages', () => {
  it('creates directory and downloads poster and backdrop', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadTvShowImages(
      81189,
      'https://artworks.thetvdb.com/banners/posters/81189.jpg',
      'https://artworks.thetvdb.com/banners/backgrounds/81189.jpg'
    );

    const tvDir = path.join(IMAGES_DIR, 'tv', '81189');
    expect(fs.mkdir).toHaveBeenCalledWith(tvDir, { recursive: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);

    // TheTVDB uses full URLs (no size prefix)
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContainEqual('https://artworks.thetvdb.com/banners/posters/81189.jpg');
    expect(urls).toContainEqual('https://artworks.thetvdb.com/banners/backgrounds/81189.jpg');

    const paths = vi.mocked(fs.writeFile).mock.calls.map((c) => c[0]);
    expect(paths).toContainEqual(path.join(tvDir, 'poster.jpg'));
    expect(paths).toContainEqual(path.join(tvDir, 'backdrop.jpg'));
  });

  it('skips null URLs', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadTvShowImages(81189, 'https://artworks.thetvdb.com/p.jpg', null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it('skips all downloads when both URLs are null', async () => {
    await service.downloadTvShowImages(81189, null, null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('skips download if file already exists', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    await service.downloadTvShowImages(81189, 'https://artworks.thetvdb.com/poster.jpg', null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('handles network failures gracefully with retries', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadTvShowImages(81189, 'https://artworks.thetvdb.com/p.jpg', null);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('handles HTTP error status gracefully', async () => {
    fetchMock.mockResolvedValueOnce(mockImageResponse(new ArrayBuffer(0), 404));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      service.downloadTvShowImages(81189, 'https://artworks.thetvdb.com/p.jpg', null)
    ).resolves.toBeUndefined();

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('blocks downloads from untrusted hosts (SSRF defense)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.downloadTvShowImages(81189, 'http://169.254.169.254/latest/meta-data', null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Blocked download from untrusted host')
    );
    consoleSpy.mockRestore();
  });
});

describe('getImagePath — tv', () => {
  it('resolves tv path under tv/ directory (not tvs/)', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    const result = await service.getImagePath('tv', 81189, 'poster');

    expect(result).toBe(path.join(IMAGES_DIR, 'tv', '81189', 'poster.jpg'));
  });

  it('returns null when tv file does not exist', async () => {
    vi.mocked(fs.stat).mockRejectedValueOnce(new Error('ENOENT'));

    const result = await service.getImagePath('tv', 81189, 'poster');

    expect(result).toBeNull();
  });
});

describe('deleteTvShowImages', () => {
  it('removes the tv show image directory', async () => {
    vi.mocked(fs.rm).mockResolvedValueOnce(undefined);

    await service.deleteTvShowImages(81189);

    expect(fs.rm).toHaveBeenCalledWith(path.join(IMAGES_DIR, 'tv', '81189'), {
      recursive: true,
      force: true,
    });
  });
});

describe('rate limiter integration', () => {
  it('calls rateLimiter.acquire() before each fetch', async () => {
    const mockAcquire = vi.fn().mockResolvedValue(undefined);
    const rateLimitedService = new ImageCacheService(IMAGES_DIR, { acquire: mockAcquire });

    fetchMock.mockResolvedValue(mockImageResponse());

    await rateLimitedService.downloadMovieImages(550, '/poster.jpg', '/backdrop.jpg', null);

    expect(mockAcquire).toHaveBeenCalledTimes(2);
    // acquire is called before each fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not call acquire when no rate limiter is provided', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadMovieImages(550, '/poster.jpg', null, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips fetch if acquire rejects (retries exhaust)', async () => {
    vi.useFakeTimers();
    const mockAcquire = vi.fn().mockRejectedValue(new Error('Rate limit destroyed'));
    const rateLimitedService = new ImageCacheService(IMAGES_DIR, { acquire: mockAcquire });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = rateLimitedService.downloadMovieImages(550, '/poster.jpg', null, null);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('generatePlaceholder', () => {
  it('creates SVG placeholder with movie title', async () => {
    await service.generatePlaceholder(550, 'Fight Club');

    const movieDir = path.join(IMAGES_DIR, 'movies', '550');
    expect(fs.mkdir).toHaveBeenCalledWith(movieDir, { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);

    const [destPath, content] = vi.mocked(fs.writeFile).mock.calls[0]!;
    expect(destPath).toBe(path.join(movieDir, 'poster.jpg'));
    expect(content).toContain('<svg');
    expect(content).toContain('Fight Club');
  });

  it('skips generation if poster already exists', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    await service.generatePlaceholder(550, 'Fight Club');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('escapes HTML entities in title', async () => {
    await service.generatePlaceholder(999, 'Tom & Jerry <3');

    const [, content] = vi.mocked(fs.writeFile).mock.calls[0]!;
    expect(content).toContain('Tom &amp; Jerry &lt;3');
    expect(content).not.toContain('Tom & Jerry <3');
  });

  it('generates deterministic colour from tmdbId', async () => {
    await service.generatePlaceholder(550, 'Movie A');
    const [, content1] = vi.mocked(fs.writeFile).mock.calls[0]!;

    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

    await service.generatePlaceholder(551, 'Movie B');
    const [, content2] = vi.mocked(fs.writeFile).mock.calls[0]!;

    // Different tmdbIds should produce different hues
    const hue1 = (content1 as string).match(/hsl\((\d+)/)?.[1];
    const hue2 = (content2 as string).match(/hsl\((\d+)/)?.[1];
    expect(hue1).toBeDefined();
    expect(hue2).toBeDefined();
    expect(hue1).not.toBe(hue2);
  });
});

describe('downloadSeasonPoster', () => {
  it('downloads season poster to season_{num}.jpg', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadSeasonPoster(
      81189,
      1,
      'https://artworks.thetvdb.com/banners/seasons/81189-1.jpg'
    );

    const tvDir = path.join(IMAGES_DIR, 'tv', '81189');
    expect(fs.mkdir).toHaveBeenCalledWith(tvDir, { recursive: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://artworks.thetvdb.com/banners/seasons/81189-1.jpg'
    );

    const destPath = vi.mocked(fs.writeFile).mock.calls[0]![0];
    expect(destPath).toBe(path.join(tvDir, 'season_1.jpg'));
  });

  it('uses season_0.jpg for specials', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadSeasonPoster(
      81189,
      0,
      'https://artworks.thetvdb.com/banners/seasons/81189-0.jpg'
    );

    const destPath = vi.mocked(fs.writeFile).mock.calls[0]![0];
    expect(destPath).toBe(path.join(IMAGES_DIR, 'tv', '81189', 'season_0.jpg'));
  });

  it('skips download when posterUrl is null', async () => {
    await service.downloadSeasonPoster(81189, 1, null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});

describe('downloadTvShowImages — season posters', () => {
  it('downloads season posters alongside show images', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadTvShowImages(
      81189,
      'https://artworks.thetvdb.com/banners/posters/81189.jpg',
      null,
      [
        { seasonNumber: 1, posterUrl: 'https://artworks.thetvdb.com/banners/seasons/81189-1.jpg' },
        { seasonNumber: 2, posterUrl: 'https://artworks.thetvdb.com/banners/seasons/81189-2.jpg' },
      ]
    );

    // show poster + 2 season posters = 3 downloads
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const paths = vi.mocked(fs.writeFile).mock.calls.map((c) => c[0]);
    expect(paths).toContainEqual(path.join(IMAGES_DIR, 'tv', '81189', 'poster.jpg'));
    expect(paths).toContainEqual(path.join(IMAGES_DIR, 'tv', '81189', 'season_1.jpg'));
    expect(paths).toContainEqual(path.join(IMAGES_DIR, 'tv', '81189', 'season_2.jpg'));
  });

  it('skips null season poster URLs', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadTvShowImages(81189, null, null, [{ seasonNumber: 1, posterUrl: null }]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads logo alongside other TV images', async () => {
    fetchMock.mockResolvedValue(mockImageResponse());

    await service.downloadTvShowImages(
      81189,
      'https://artworks.thetvdb.com/banners/posters/81189.jpg',
      null,
      undefined,
      'https://artworks.thetvdb.com/banners/logos/81189.png'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const paths = vi.mocked(fs.writeFile).mock.calls.map((c) => c[0]);
    expect(paths).toContainEqual(path.join(IMAGES_DIR, 'tv', '81189', 'poster.jpg'));
    expect(paths).toContainEqual(path.join(IMAGES_DIR, 'tv', '81189', 'logo.png'));
  });
});

describe('generateTvPlaceholder', () => {
  it('creates SVG placeholder for a TV show', async () => {
    await service.generateTvPlaceholder(81189, 'Breaking Bad');

    const tvDir = path.join(IMAGES_DIR, 'tv', '81189');
    expect(fs.mkdir).toHaveBeenCalledWith(tvDir, { recursive: true });

    const [destPath, content] = vi.mocked(fs.writeFile).mock.calls[0]!;
    expect(destPath).toBe(path.join(tvDir, 'poster.jpg'));
    expect(content).toContain('<svg');
    expect(content).toContain('Breaking Bad');
  });

  it('creates SVG placeholder for a season with season label', async () => {
    await service.generateTvPlaceholder(81189, 'Breaking Bad', 1);

    const [destPath, content] = vi.mocked(fs.writeFile).mock.calls[0]!;
    expect(destPath).toBe(path.join(IMAGES_DIR, 'tv', '81189', 'season_1.jpg'));
    expect(content).toContain('Breaking Bad');
    expect(content).toContain('Season 1');
  });

  it('skips if file already exists', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    await service.generateTvPlaceholder(81189, 'Breaking Bad');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('getSeasonImagePath', () => {
  it('returns path when season poster exists', async () => {
    vi.mocked(fs.stat).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fs.stat>>);

    const result = await service.getSeasonImagePath(81189, 1);

    expect(result).toBe(path.join(IMAGES_DIR, 'tv', '81189', 'season_1.jpg'));
  });

  it('returns null when season poster does not exist', async () => {
    vi.mocked(fs.stat).mockRejectedValueOnce(new Error('ENOENT'));

    const result = await service.getSeasonImagePath(81189, 1);

    expect(result).toBeNull();
  });
});

describe('retry behavior', () => {
  it('succeeds on second attempt after transient failure', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(mockImageResponse());
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadMovieImages(550, '/poster.jpg', null, null);
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    // Only 1 retry warning, no final failure
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]![0]).toContain('Attempt 1 failed');

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('succeeds on third attempt after two transient failures', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce(mockImageResponse());
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadMovieImages(550, '/poster.jpg', null, null);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('does not retry on 4xx client errors', async () => {
    fetchMock.mockResolvedValueOnce(mockImageResponse(new ArrayBuffer(0), 403));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.downloadMovieImages(550, '/poster.jpg', null, null);

    // Single warn, no retries
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]![0]).toContain('403');
    expect(consoleSpy.mock.calls[0]![0]).toContain('skipping');

    consoleSpy.mockRestore();
  });

  it('retries on 5xx server errors', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(mockImageResponse(new ArrayBuffer(0), 502))
      .mockResolvedValueOnce(mockImageResponse());
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadMovieImages(550, '/poster.jpg', null, null);
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('uses linear backoff for retry delays', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = service.downloadMovieImages(550, '/poster.jpg', null, null);

    // After 499ms, only first attempt should have run
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // At 500ms, second attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After another 999ms, still only 2 attempts
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // At 1000ms more, third attempt fires
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });
});
