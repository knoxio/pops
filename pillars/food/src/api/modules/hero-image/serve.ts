/**
 * Plain Express handler that streams a recipe hero-image file.
 *
 * Mounted as `GET /recipes/:recipeId/:filename` BEFORE the ts-rest
 * endpoints. It falls through (`next()`) for anything that isn't a numeric
 * recipe id + a known hero filename, so it never shadows the ts-rest
 * `GET /recipes/:slug` / `/recipes/:slug/drafts` routes — only genuine
 * `…/hero.jpg` / `…/hero-thumb.webp` / `…/hero-card.webp` requests serve a
 * file. Path traversal is rejected by `resolveServablePath`'s sandbox check.
 */
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

import { isValidHeroFilename, resolveServablePath } from './paths.js';

import type { NextFunction, Request, Response } from 'express';

const CONTENT_TYPE: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function serveHeroImage(req: Request, res: Response, next: NextFunction): void {
  const rawId = req.params['recipeId'];
  const rawName = req.params['filename'];
  const recipeId = typeof rawId === 'string' ? Number(rawId) : NaN;
  const filename = typeof rawName === 'string' ? rawName : '';
  if (!Number.isInteger(recipeId) || recipeId <= 0 || !isValidHeroFilename(filename)) {
    next();
    return;
  }
  const absPath = resolveServablePath(recipeId, filename);
  if (absPath === null || !existsSync(absPath)) {
    res.status(404).json({ message: 'Hero image not found' });
    return;
  }
  const contentType = CONTENT_TYPE[extname(absPath).toLowerCase()];
  if (contentType !== undefined) res.type(contentType);
  // User-uploaded content: short private cache, revalidated on change.
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(absPath);
}
