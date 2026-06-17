/**
 * ts-rest handlers for `cerebrum.templates.*`.
 *
 * Reads from the in-memory `TemplateRegistry` (loaded from disk at boot).
 * `list` strips the Markdown body to keep the list-view payload small; `get`
 * returns the full template or a 404 envelope.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumTemplatesContract } from '../../contract/rest-templates.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeTemplatesHandlers(
  registry: TemplateRegistry
): ReturnType<typeof server.router<typeof cerebrumTemplatesContract>> {
  return server.router(cerebrumTemplatesContract, {
    list: async () => {
      const templates = registry.list().map(({ body: _body, ...rest }) => rest);
      return { status: 200, body: { templates } };
    },
    get: async ({ params }) =>
      runHttp(() => {
        const template = registry.get(params.name);
        if (!template) throw new NotFoundError('template', params.name);
        return { status: 200, body: { template } };
      }),
  });
}
