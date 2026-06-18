/**
 * Tests for the inventory pillar's Paperless-ngx thumbnail proxy route. The
 * Paperless client module is mocked so no real Paperless instance is needed;
 * the same module specifier `../modules/paperless/index.js` that `router.ts`
 * imports is mocked here, so the route gets the fake client.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockPaperlessClient {
  fetchThumbnail: ReturnType<typeof vi.fn>;
}

const mockGetPaperlessClient = vi.fn<() => MockPaperlessClient | null>();

vi.mock('../modules/paperless/index.js', () => ({
  getPaperlessClient: (): MockPaperlessClient | null => mockGetPaperlessClient(),
}));

const { createInventoryFilesRouter } = await import('./router.js');

function app(): Express {
  const a = express();
  a.use(createInventoryFilesRouter());
  return a;
}

beforeEach(() => {
  mockGetPaperlessClient.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /inventory/documents/:id/thumbnail', () => {
  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app()).get('/inventory/documents/abc/thumbnail');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid document id');
  });

  it('returns 503 when Paperless is not configured', async () => {
    mockGetPaperlessClient.mockReturnValue(null);
    const res = await request(app()).get('/inventory/documents/42/thumbnail');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('not configured');
  });

  describe('when Paperless is configured', () => {
    const fetchThumbnail = vi.fn();

    beforeEach(() => {
      mockGetPaperlessClient.mockReturnValue({ fetchThumbnail });
      fetchThumbnail.mockReset();
    });

    it('proxies the thumbnail image on success', async () => {
      const bytes = Buffer.from('fake-image-data');
      fetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/webp' }),
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      });

      const res = await request(app()).get('/inventory/documents/42/thumbnail');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
      expect(fetchThumbnail).toHaveBeenCalledWith(42);
    });

    it('defaults content-type to image/png when the header is missing', async () => {
      const bytes = Buffer.from('fake-png-data');
      fetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      });

      const res = await request(app()).get('/inventory/documents/42/thumbnail');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    });

    it('returns 404 when the document is not in Paperless', async () => {
      fetchThumbnail.mockResolvedValue({ ok: false, status: 404 });
      const res = await request(app()).get('/inventory/documents/999/thumbnail');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('returns 502 on other upstream errors', async () => {
      fetchThumbnail.mockResolvedValue({ ok: false, status: 500 });
      const res = await request(app()).get('/inventory/documents/42/thumbnail');
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Failed to fetch thumbnail');
    });

    it('returns 502 when the client throws PaperlessApiError', async () => {
      const { PaperlessApiError } = await import('../modules/paperless/types.js');
      fetchThumbnail.mockRejectedValue(new PaperlessApiError(0, 'Network error: timeout'));
      const res = await request(app()).get('/inventory/documents/42/thumbnail');
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Paperless error');
    });
  });
});
