import { z } from 'zod';

import { HERO_ALLOWED_MIME_TYPES } from './paths.js';

/** Mime types the upload endpoint accepts. */
export const HeroImageMimeSchema = z.enum(HERO_ALLOWED_MIME_TYPES as [string, ...string[]]);

export const UploadHeroSchema = z.object({
  recipeId: z.number().int().positive(),
  mimeType: HeroImageMimeSchema,
  /** Base64-encoded image bytes. The router decodes this to a Buffer. */
  contentBase64: z.string().min(1, 'Image content is required'),
});
export type UploadHeroSchemaInput = z.infer<typeof UploadHeroSchema>;

export const RemoveHeroSchema = z.object({
  recipeId: z.number().int().positive(),
});
export type RemoveHeroSchemaInput = z.infer<typeof RemoveHeroSchema>;
