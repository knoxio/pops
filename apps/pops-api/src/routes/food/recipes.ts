/**
 * Express route for serving recipe hero images (PRD-124).
 *
 *   GET /api/food/recipes/:recipeId/:filename
 *
 * Mounted before auth so plain `<img>` tags can render without the JWT
 * cookie. `recipeId` is integer-only; `filename` is one of the known hero
 * assets — `hero.<ext>`, `hero-thumb.webp`, or `hero-card.webp`. Anything
 * else returns 400. Path traversal is guarded twice: once by the regex,
 * once by the `resolveServablePath` sandbox check.
 */
import { type Router as ExpressRouter, type Request, Router } from 'express';

import { isValidHeroFilename, resolveServablePath } from '../../modules/food/hero-image/paths.js';
import { tryServeFile } from '../media/images-helpers.js';

/**
 * User-uploaded content — short cache; thumbnails are regenerated when the
 * user re-uploads, but the URL doesn't change so we don't want a long
 * cache window across replacements.
 */
const CACHE_CONTROL = 'private, max-age=3600';

interface ValidationFailure {
  status: number;
  body: { error: string };
}

interface ValidatedParams {
  recipeId: number;
  filename: string;
}

function validateParams(req: Request): ValidatedParams | ValidationFailure {
  const rawId = String(req.params['recipeId'] ?? '');
  const filename = String(req.params['filename'] ?? '');
  if (!/^\d+$/.test(rawId)) {
    return { status: 400, body: { error: `Invalid recipe id: ${rawId}` } };
  }
  if (!isValidHeroFilename(filename)) {
    return { status: 400, body: { error: `Invalid filename: ${filename}` } };
  }
  const recipeId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { status: 400, body: { error: `Invalid recipe id: ${rawId}` } };
  }
  return { recipeId, filename };
}

function isValidationFailure(v: ValidatedParams | ValidationFailure): v is ValidationFailure {
  return 'status' in v;
}

const router: ExpressRouter = Router();

router.get('/api/food/recipes/:recipeId/:filename', async (req, res): Promise<void> => {
  const params = validateParams(req);
  if (isValidationFailure(params)) {
    res.status(params.status).json(params.body);
    return;
  }

  const absPath = resolveServablePath(params.recipeId, params.filename);
  if (absPath === null) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const served = await tryServeFile(absPath, res, CACHE_CONTROL);
  if (served) return;

  res.status(404).json({ error: 'Image not found' });
});

export default router;
