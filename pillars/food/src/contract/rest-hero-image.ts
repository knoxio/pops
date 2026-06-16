/**
 * `heroImage.*` sub-router — recipe hero-image upload (base64-in-JSON,
 * parity with inventory photos) + removal. The binary GET serve route is a
 * plain Express route in `app.ts` (it streams a file, not JSON).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const UploadHeroResultSchema = z.object({
  heroImagePath: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
});

export const foodHeroImageContract = c.router({
  upload: {
    method: 'POST',
    path: '/recipes/:recipeId/hero-image',
    pathParams: z.object({ recipeId: PathPositiveInt }),
    body: z.object({
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      contentBase64: z.string().min(1),
    }),
    responses: {
      200: z.object({ data: UploadHeroResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Upload a recipe hero image (base64)',
  },
  remove: {
    method: 'DELETE',
    path: '/recipes/:recipeId/hero-image',
    pathParams: z.object({ recipeId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true), message: z.string() }), ...ERR_RESPONSES },
    summary: 'Remove a recipe hero image',
  },
});
