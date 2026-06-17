/**
 * ts-rest handlers for `cerebrum.tags.*`.
 *
 * A single read over the tag vocabulary. The prefix is validated against the
 * typeahead grammar (short alphanumeric token); an invalid prefix yields an
 * empty list rather than a 400 so a noisy autocomplete keystroke degrades
 * gracefully — matching the monolith's prefix-schema behaviour.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumTagsContract } from '../../contract/rest-tags.js';
import { type CerebrumDb } from '../../db/index.js';
import { listTags } from '../modules/engrams/tags.js';

const server: ReturnType<typeof initServer> = initServer();

const TAG_PREFIX = /^[a-z0-9][a-z0-9-_:.]{0,63}$/i;

export function makeTagsHandlers(
  db: CerebrumDb
): ReturnType<typeof server.router<typeof cerebrumTagsContract>> {
  return server.router(cerebrumTagsContract, {
    list: async ({ query }) => {
      const prefix =
        query.prefix !== undefined && TAG_PREFIX.test(query.prefix)
          ? query.prefix.toLowerCase()
          : undefined;
      // A supplied-but-invalid prefix matches nothing (parity with the
      // monolith's strict prefix schema, which rejected such input before the
      // query ran).
      if (query.prefix !== undefined && prefix === undefined) {
        return { status: 200, body: { tags: [] } };
      }
      return { status: 200, body: { tags: listTags(db, prefix, query.limit) } };
    },
  });
}
