/**
 * Tests for the inventory pillar's static byte-serving routes (photos +
 * direct-upload documents). Filesystem-only (no DB), exercised against real
 * fixture files in temp dirs set as INVENTORY_IMAGES_DIR / INVENTORY_DOCUMENTS_DIR.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createInventoryFilesRouter } from './router.js';

const ITEM_ID = 'abc123def456789012345678901234ab';
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF_BYTES = Buffer.from('%PDF-1.7\n%fake\n');

let imagesDir: string;
let documentsDir: string;
let prevImagesEnv: string | undefined;
let prevDocumentsEnv: string | undefined;

function app(): Express {
  const a = express();
  a.use(createInventoryFilesRouter());
  return a;
}

beforeEach(() => {
  imagesDir = mkdtempSync(join(tmpdir(), 'inv-images-'));
  documentsDir = mkdtempSync(join(tmpdir(), 'inv-docs-'));
  prevImagesEnv = process.env['INVENTORY_IMAGES_DIR'];
  prevDocumentsEnv = process.env['INVENTORY_DOCUMENTS_DIR'];
  process.env['INVENTORY_IMAGES_DIR'] = imagesDir;
  process.env['INVENTORY_DOCUMENTS_DIR'] = documentsDir;
});

afterEach(() => {
  if (prevImagesEnv === undefined) delete process.env['INVENTORY_IMAGES_DIR'];
  else process.env['INVENTORY_IMAGES_DIR'] = prevImagesEnv;
  if (prevDocumentsEnv === undefined) delete process.env['INVENTORY_DOCUMENTS_DIR'];
  else process.env['INVENTORY_DOCUMENTS_DIR'] = prevDocumentsEnv;
  rmSync(imagesDir, { recursive: true, force: true });
  rmSync(documentsDir, { recursive: true, force: true });
});

function writePhoto(filename: string, bytes: Buffer): void {
  const dir = join(imagesDir, 'items', ITEM_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), bytes);
}

function writeDoc(filename: string, bytes: Buffer): void {
  const dir = join(documentsDir, 'items', ITEM_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), bytes);
}

describe('GET /api/inventory/photos/items/:itemId/:filename', () => {
  it('serves an existing photo with content-type, private cache, and etag', async () => {
    writePhoto('photo_001.jpg', JPEG_BYTES);

    const res = await request(app()).get(`/api/inventory/photos/items/${ITEM_ID}/photo_001.jpg`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(res.headers['etag']).toBeDefined();
    expect(res.body).toEqual(JPEG_BYTES);
  });

  it('returns 304 on a matching If-None-Match', async () => {
    writePhoto('photo_002.jpg', JPEG_BYTES);
    const first = await request(app()).get(`/api/inventory/photos/items/${ITEM_ID}/photo_002.jpg`);
    const etag = first.headers['etag'];

    const res = await request(app())
      .get(`/api/inventory/photos/items/${ITEM_ID}/photo_002.jpg`)
      .set('If-None-Match', etag);

    expect(res.status).toBe(304);
  });

  it('returns 404 when the photo does not exist', async () => {
    const res = await request(app()).get(`/api/inventory/photos/items/${ITEM_ID}/photo_404.jpg`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Photo not found');
  });

  it('returns 400 for a filename that does not match the photo convention', async () => {
    const res = await request(app()).get(`/api/inventory/photos/items/${ITEM_ID}/evil.jpg`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid filename');
  });

  it('returns 400 for a filename with a non-jpg extension', async () => {
    const res = await request(app()).get(`/api/inventory/photos/items/${ITEM_ID}/photo_1.png`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid filename');
  });
});

describe('GET /api/inventory/documents/items/:itemId/:filename', () => {
  it('serves an existing direct-upload document (PDF)', async () => {
    writeDoc('file_001.pdf', PDF_BYTES);

    const res = await request(app()).get(`/api/inventory/documents/items/${ITEM_ID}/file_001.pdf`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(res.body).toEqual(PDF_BYTES);
  });

  it('returns 404 when the document does not exist', async () => {
    const res = await request(app()).get(`/api/inventory/documents/items/${ITEM_ID}/file_999.pdf`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Document not found');
  });

  it('returns 400 for a filename that does not match the upload convention', async () => {
    const res = await request(app()).get(`/api/inventory/documents/items/${ITEM_ID}/notes.pdf`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid filename');
  });
});
