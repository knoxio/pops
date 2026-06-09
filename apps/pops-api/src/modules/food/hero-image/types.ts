/**
 * Zod schemas for the food.heroImage tRPC namespace (PRD-124).
 *
 * Wire format is base64 to keep the JSON-only tRPC transport simple. If
 * file sizes outgrow this we'll move to multipart uploads — flagged out of
 * scope in the PRD.
 */
import { z } from 'zod';

import { HERO_ALLOWED_MIME_TYPES } from './service.js';

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
