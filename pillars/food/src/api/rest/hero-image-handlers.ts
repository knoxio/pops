/**
 * Handlers for the `heroImage.*` sub-router. Upload decodes the base64 body
 * to a Buffer and delegates to the lifted service; the service throws
 * `NotFoundError` (404) / `ValidationError` (400), which `runHttp` maps.
 */
import { removeHeroImage, uploadHeroImage } from '../modules/hero-image/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodHeroImageContract } from '../../contract/rest-hero-image.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodHeroImageContract>;

export function makeHeroImageHandlers(db: FoodDb) {
  return {
    upload: ({ params, body }: Req['upload']) =>
      runHttp(async () => {
        const buffer = Buffer.from(body.contentBase64, 'base64');
        const data = await uploadHeroImage(db, {
          recipeId: params.recipeId,
          mimeType: body.mimeType,
          buffer,
        });
        return { status: 200 as const, body: { data, message: 'Hero image uploaded' } };
      }),

    remove: ({ params }: Req['remove']) =>
      runHttp(() => {
        removeHeroImage(db, params.recipeId);
        return { status: 200 as const, body: { ok: true as const, message: 'Hero image removed' } };
      }),
  };
}
