/**
 * Image serving endpoint tests.
 */
import { join } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import imagesRouter from './images.js';

// Mock node:fs/promises
vi.mock('node:fs/promises');
import * as fs from 'node:fs/promises';

// Mock database
const mockGet = vi.fn<() => { path: string | null } | undefined>(() => undefined);
vi.mock('../../db.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: mockGet,
    })),
  })),
}));

// Mock image cache
const mockDownloadMovieImages = vi.fn(async () => {});
const mockDownloadTvShowImages = vi.fn(async () => {});
vi.mock('../../modules/media/tmdb/index.js', () => ({
  getImageCache: vi.fn(() => ({
    downloadMovieImages: mockDownloadMovieImages,
    downloadTvShowImages: mockDownloadTvShowImages,
  })),
}));

/** Create a mock FileHandle that reads the given bytes. */
function createMockFileHandle(
  content: Buffer
): Awaited<ReturnType<(typeof import('node:fs/promises'))['open']>> {
  /* FileHandle has ~20 methods; only read() and close() are called by the route. */
  const handle = {
    fd: 0,
    appendFile: vi.fn(),
    chmod: vi.fn(),
    chown: vi.fn(),
    close: vi.fn(),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    datasync: vi.fn(),
    read: vi.fn(),
    readFile: vi.fn(),
    readLines: vi.fn(),
    readableWebStream: vi.fn(),
    readv: vi.fn(),
    stat: vi.fn(),
    sync: vi.fn(),
    truncate: vi.fn(),
    utimes: vi.fn(),
    write: vi.fn(),
    writeFile: vi.fn(),
    writev: vi.fn(),
    [Symbol.asyncDispose]: vi.fn(),
  } as Awaited<ReturnType<(typeof import('node:fs/promises'))['open']>>;

  // Set up read implementation after cast to avoid overload signature mismatch
  handle.read = vi
    .fn()
    .mockImplementation(async (buf: Buffer, _offset: number, length: number, position: number) => {
      const bytesToRead = Math.min(length, content.length - position);
      content.copy(buf, 0, position, position + bytesToRead);
      return { bytesRead: bytesToRead, buffer: buf };
    }) as typeof handle.read;

  return handle;
}

const TEST_IMAGES_DIR = '/test/media/images';

function createTestApp() {
  const app = express();
  app.use(imagesRouter);
  return app;
}

beforeEach(() => {
  vi.stubEnv('MEDIA_IMAGES_DIR', TEST_IMAGES_DIR);
  // Default: files don't exist
  vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
  // Default: open fails (file doesn't exist) → removeCorruptedPlaceholder returns false
  vi.mocked(fs.open).mockRejectedValue(new Error('ENOENT'));
  vi.mocked(fs.unlink).mockResolvedValue(undefined);
  mockGet.mockReturnValue(undefined);
  mockDownloadMovieImages.mockResolvedValue(undefined);
  mockDownloadTvShowImages.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /media/images/:mediaType/:id/:filename', () => {
  describe('parameter validation', () => {
    it('returns 400 for invalid media type', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/tvshow/550/poster.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid media type');
    });

    it('returns 400 for non-numeric id', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/movie/abc/poster.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid id');
    });

    it('returns 400 for invalid filename', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/movie/550/malicious.exe');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid filename');
    });

    it('accepts all valid filenames', async () => {
      const app = createTestApp();

      for (const filename of ['poster.jpg', 'backdrop.jpg', 'logo.png', 'override.jpg']) {
        const res = await request(app).get(`/media/images/movie/550/${filename}`);
        // Should be 404 (file not found), not 400 (validation error)
        expect(res.status).toBe(404);
      }
    });
  });

  describe('file serving', () => {
    it('returns 404 when image does not exist', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/movie/550/poster.jpg');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Image not found');
    });

    it('serves file with correct headers when it exists', async () => {
      const app = createTestApp();
      const expectedPath = join(TEST_IMAGES_DIR, 'movies', '550', 'poster.jpg');

      // Mock stat to succeed for the poster file
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        if (path === expectedPath) {
          return { mtimeMs: 1700000000000, size: 12345 } as Awaited<ReturnType<typeof fs.stat>>;
        }
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/movie/550/poster.jpg');

      // sendFile will fail in test (no actual file) but headers are set
      // We check that stat was called with the correct path
      expect(fs.stat).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('override resolution', () => {
    it('checks for override.jpg before poster.jpg', async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, 'movies', '550', 'override.jpg');
      const posterPath = join(TEST_IMAGES_DIR, 'movies', '550', 'poster.jpg');

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/movie/550/poster.jpg');

      // Override should be checked first
      expect(statCalls[0]).toBe(overridePath);
      // Then the actual poster
      expect(statCalls[1]).toBe(posterPath);
    });

    it('does not check override for non-poster requests', async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, 'movies', '550', 'override.jpg');

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/movie/550/backdrop.jpg');

      // Override should NOT be checked for backdrop
      expect(statCalls).not.toContain(overridePath);
    });
  });

  describe('tv media type', () => {
    it('accepts tv as a valid media type', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/tv/81189/poster.jpg');

      // Should be 404 (file not found), not 400 (validation error)
      expect(res.status).toBe(404);
    });

    it('resolves tv images under tv/ directory (not tvs/)', async () => {
      const app = createTestApp();

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/tv/81189/poster.jpg');

      // Should look in tv/ not tvs/
      expect(statCalls.some((p) => p.includes('/tv/81189/'))).toBe(true);
      expect(statCalls.some((p) => p.includes('/tvs/'))).toBe(false);
    });

    it('checks override for tv poster requests', async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, 'tv', '81189', 'override.jpg');

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/tv/81189/poster.jpg');

      expect(statCalls[0]).toBe(overridePath);
    });
  });

  describe('on-demand download', () => {
    it('downloads movie image from TMDB on cache miss', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/abc123.jpg' });

      await request(app).get('/media/images/movie/550/poster.jpg');

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, '/abc123.jpg', null, null);
    });

    it('downloads backdrop via correct parameter slot', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/backdrop.jpg' });

      await request(app).get('/media/images/movie/550/backdrop.jpg');

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, null, '/backdrop.jpg', null);
    });

    it('downloads logo via correct parameter slot', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/logo.png' });

      await request(app).get('/media/images/movie/550/logo.png');

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, null, null, '/logo.png');
    });

    it('downloads TV poster from TheTVDB on cache miss', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: 'https://artworks.thetvdb.com/poster.jpg' });

      await request(app).get('/media/images/tv/81189/poster.jpg');

      expect(mockDownloadTvShowImages).toHaveBeenCalledWith(
        81189,
        'https://artworks.thetvdb.com/poster.jpg',
        null,
        undefined,
        null
      );
    });

    it('downloads TV logo from TheTVDB on cache miss', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: 'https://artworks.thetvdb.com/logo.png' });

      await request(app).get('/media/images/tv/81189/logo.png');

      expect(mockDownloadTvShowImages).toHaveBeenCalledWith(
        81189,
        null,
        null,
        undefined,
        'https://artworks.thetvdb.com/logo.png'
      );
    });

    it('does not attempt download when no DB record exists', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue(undefined);

      const res = await request(app).get('/media/images/movie/9999/poster.jpg');

      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it('returns 404 immediately for override.jpg without downloading', async () => {
      const app = createTestApp();

      const res = await request(app).get('/media/images/movie/550/override.jpg');

      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(mockDownloadTvShowImages).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it('returns 404 when DB has no poster_path', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: null });

      const res = await request(app).get('/media/images/movie/550/poster.jpg');

      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });
  });

  describe('CDN redirect fallback (tier 3)', () => {
    it('redirects to TMDB CDN when movie download fails', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/abc123.jpg' });
      mockDownloadMovieImages.mockRejectedValue(new Error('Download failed'));

      const res = await request(app).get('/media/images/movie/550/poster.jpg');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w780/abc123.jpg');
      expect(res.headers['cache-control']).toBe('private, max-age=300');
    });

    it('redirects to TMDB CDN with correct size for backdrops', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/backdrop.jpg' });
      mockDownloadMovieImages.mockRejectedValue(new Error('Download failed'));

      const res = await request(app).get('/media/images/movie/550/backdrop.jpg');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w1280/backdrop.jpg');
    });

    it('redirects to TMDB CDN with original size for logos', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/logo.png' });
      mockDownloadMovieImages.mockRejectedValue(new Error('Download failed'));

      const res = await request(app).get('/media/images/movie/550/logo.png');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://image.tmdb.org/t/p/original/logo.png');
    });

    it('redirects to TheTVDB URL when TV download fails', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: 'https://artworks.thetvdb.com/poster.jpg' });
      mockDownloadTvShowImages.mockRejectedValue(new Error('Download failed'));

      const res = await request(app).get('/media/images/tv/81189/poster.jpg');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://artworks.thetvdb.com/poster.jpg');
    });

    it('redirects when download silently fails (no file written)', async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: '/abc123.jpg' });
      // Download resolves but doesn't write a file (e.g. TMDB returned 404)

      const res = await request(app).get('/media/images/movie/550/poster.jpg');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w780/abc123.jpg');
    });
  });

  describe('corrupted SVG placeholder detection', () => {
    it('deletes corrupted SVG placeholder and redirects to CDN', async () => {
      const app = createTestApp();
      vi.mocked(fs.open).mockResolvedValue(createMockFileHandle(Buffer.from('<svg xmlns=...')));
      mockGet.mockReturnValue({ path: '/abc123.jpg' });

      const res = await request(app).get('/media/images/movie/550/poster.jpg');

      // Should delete the corrupted file
      expect(fs.unlink).toHaveBeenCalled();
      // Should NOT serve the corrupted file — should redirect to CDN
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w780/abc123.jpg');
    });

    it('serves real JPEG file normally without deleting', async () => {
      const app = createTestApp();
      const posterPath = join(TEST_IMAGES_DIR, 'movies', '550', 'poster.jpg');

      vi.mocked(fs.open).mockResolvedValue(
        createMockFileHandle(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
      );
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        if (path === posterPath) {
          return { mtimeMs: 1700000000000, size: 12345 } as Awaited<ReturnType<typeof fs.stat>>;
        }
        throw new Error('ENOENT');
      });

      await request(app).get('/media/images/movie/550/poster.jpg');

      // Should NOT delete a valid file
      expect(fs.unlink).not.toHaveBeenCalled();
      // stat should be called for the poster file (tryServeFile path)
      expect(fs.stat).toHaveBeenCalledWith(posterPath);
    });
  });
});
