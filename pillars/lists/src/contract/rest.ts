/**
 * REST contract for the lists pillar — ts-rest single source of truth.
 *
 * Composes the `list.*` (header CRUD + aggregate index) and `items.*`
 * (item CRUD + bulk) sub-routers from sibling files. Each sub-router
 * holds the zod-based wire definitions for its surface.
 *
 * `generateOpenApi(listsContract, …)` projects this to
 * `openapi/lists.openapi.json`; `openapi-typescript` then projects the
 * JSON to `src/contract/api-types.generated.ts` for TS consumers using
 * `openapi-fetch`. Polyglot consumers (Rust, Swift) skip the TS file and
 * generate their own off the JSON.
 *
 * Lego principle: this is the ONLY description of the lists wire format.
 * Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { listsItemsContract } from './rest-items.js';
import { listsListContract } from './rest-list.js';

const c = initContract();

export const listsContract = c.router(
  {
    list: listsListContract,
    items: listsItemsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type ListsContract = typeof listsContract;
