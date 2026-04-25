/**
 * Tests for the inventory photo static-file route.
 *
 * The route is filesystem-only (no DB), so we exercise it with real fixture
 * files in a temp dir set as INVENTORY_IMAGES_DIR.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import photosRouter from './photos.js';

let tempDir: string;
let originalEnv: string | undefined;

function createTestApp(): express.Express {
  const app = express();
  app.use(photosRouter);
  return app;
}

const ITEM_ID = 'abc123def456789012345678901234ab';

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `pops-photos-route-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tempDir, { recursive: true });
  originalEnv = process.env.INVENTORY_IMAGES_DIR;
  process.env.INVENTORY_IMAGES_DIR = tempDir;
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.INVENTORY_IMAGES_DIR;
  } else {
    process.env.INVENTORY_IMAGES_DIR = originalEnv;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/inventory/photos/items/:itemId/:filename', () => {
  describe('successful serving', () => {
    it('serves an existing photo file with correct content-type and cache headers', async () => {
      const itemDir = join(tempDir, 'items', ITEM_ID);
      mkdirSync(itemDir, { recursive: true });
      const fileBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]); // JPEG magic
      writeFileSync(join(itemDir, 'photo_001.jpg'), fileBytes);

      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_001.jpg`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
      expect(res.headers['etag']).toBeDefined();
      expect(res.body).toEqual(fileBytes);
    });

    it('returns 304 Not Modified on matching If-None-Match', async () => {
      const itemDir = join(tempDir, 'items', ITEM_ID);
      mkdirSync(itemDir, { recursive: true });
      writeFileSync(join(itemDir, 'photo_002.jpg'), Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const app = createTestApp();
      const first = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_002.jpg`);
      const etag = first.headers['etag'];
      expect(typeof etag).toBe('string');
      if (typeof etag !== 'string') return; // type narrow for the next call

      const second = await request(app)
        .get(`/api/inventory/photos/items/${ITEM_ID}/photo_002.jpg`)
        .set('If-None-Match', etag);

      expect(second.status).toBe(304);
    });
  });

  describe('not found', () => {
    it('returns 404 when the item directory does not exist', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_001.jpg`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Photo not found');
    });

    it('returns 404 when the file is missing inside an existing item dir', async () => {
      mkdirSync(join(tempDir, 'items', ITEM_ID), { recursive: true });
      const app = createTestApp();

      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_999.jpg`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Photo not found');
    });
  });

  describe('parameter validation', () => {
    it('returns 400 for invalid filename pattern (.png)', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/cover.png`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid filename');
    });

    it('returns 400 for filename without sequence number', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_.jpg`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid filename');
    });

    it('returns 400 for an itemId containing path traversal segments', async () => {
      // The route is `/api/inventory/photos/items/:itemId/:filename`. A request to
      // `/api/inventory/photos/items/..%2Fetc%2Fpasswd` decodes the params before
      // matching, so itemId arrives as `../etc/passwd` and is rejected by the
      // ITEM_ID_RE / `..` checks before the FS is touched.
      const app = createTestApp();
      const res = await request(app).get(
        '/api/inventory/photos/items/..%2Fetc%2Fpasswd/photo_001.jpg'
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid item id');
    });

    it('returns 400 for an itemId with disallowed characters', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/inventory/photos/items/foo$bar/photo_001.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid item id');
    });
  });

  describe('default INVENTORY_IMAGES_DIR fallback', () => {
    it('does not throw when env var is unset (uses default ./data/inventory/images)', async () => {
      delete process.env.INVENTORY_IMAGES_DIR;
      const app = createTestApp();

      // The default dir likely doesn't exist in the test runner — we just want
      // a clean 404, NOT a 500 from the route imploding on missing config.
      const res = await request(app).get(`/api/inventory/photos/items/${ITEM_ID}/photo_001.jpg`);

      expect(res.status).toBe(404);
    });
  });
});
