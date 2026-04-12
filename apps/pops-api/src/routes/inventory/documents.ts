/**
 * Express route for proxying Paperless-ngx document thumbnails.
 *
 * GET /inventory/documents/:id/thumbnail
 *
 * Proxies the thumbnail from Paperless-ngx API, avoiding direct client
 * exposure of internal Paperless URLs and API tokens. Returns the image
 * with cache headers. Returns 404 if document is not found in Paperless.
 */
import { type Router as ExpressRouter, Router } from 'express';

import { getPaperlessClient } from '../../modules/inventory/paperless/index.js';
import { PaperlessApiError } from '../../modules/inventory/paperless/types.js';

const CACHE_CONTROL = 'public, max-age=3600';

const router: ExpressRouter = Router();

router.get('/inventory/documents/:id/thumbnail', async (req, res): Promise<void> => {
  const { id } = req.params;

  // Validate id is numeric
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: `Invalid document id: ${id}` });
    return;
  }

  const client = getPaperlessClient();
  if (!client) {
    res.status(503).json({ error: 'Paperless-ngx is not configured' });
    return;
  }

  try {
    const response = await client.fetchThumbnail(Number(id));

    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.status(502).json({ error: 'Failed to fetch thumbnail from Paperless' });
      return;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    res.set({
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    if (err instanceof PaperlessApiError) {
      res.status(502).json({ error: `Paperless error: ${err.message}` });
      return;
    }
    console.error('[Documents] Thumbnail proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch thumbnail' });
  }
});

export default router;
