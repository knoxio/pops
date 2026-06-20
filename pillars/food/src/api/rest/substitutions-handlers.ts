/**
 * Handlers for the `substitutions.*` sub-router.
 *
 * `CannotSubstituteSelf` (self-referential edge) → 400. `resolveForLine`
 * returns `{ ok:false, reason:'LineNotFound' }` from the service → 404. The
 * graph-view handler maps the service's edge rows to node ids via the
 * moved `graph-view` helpers.
 */
import {
  CannotSubstituteSelf,
  substitutionsGraph,
  substitutionsHydrate,
  substitutionsQueries,
  substitutionsService,
} from '../../db/index.js';
import { deriveNodes, sideToNodeId } from '../modules/substitutions/graph-view.js';
import { resolveForLine } from '../modules/substitutions/substitutions-resolve-line.js';
import { HttpError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodSubstitutionsContract } from '../../contract/rest-substitutions.js';
import type { FoodDb } from '../../db/index.js';
import type { GraphViewEdge } from '../modules/substitutions/graph-view.js';

type Req = ServerInferRequest<typeof foodSubstitutionsContract>;

export function makeSubstitutionsHandlers(db: FoodDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: substitutionsQueries.listSubstitutions(db, query) },
      })),

    listHydrated: ({ query }: Req['listHydrated']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: substitutionsHydrate.listSubstitutionsHydrated(db, query) },
      })),

    graphView: ({ query }: Req['graphView']) =>
      runHttp(() => {
        const { edges: hydrated } = substitutionsGraph.loadGraphView(db, query);
        const edges: GraphViewEdge[] = hydrated.map((edge) => ({
          id: edge.id,
          fromNodeId: sideToNodeId(edge.fromSide),
          toNodeId: sideToNodeId(edge.toSide),
          ratio: edge.ratio,
          contextTags: edge.contextTags,
          scope: edge.scope,
          recipeId: edge.recipeId,
          recipeSlug: edge.recipeSlug,
          notes: edge.notes,
        }));
        return { status: 200 as const, body: { nodes: deriveNodes(hydrated), edges } };
      }),

    resolveForLine: ({ query }: Req['resolveForLine']) =>
      runHttp(() => {
        const result = resolveForLine(db, query);
        if (!result.ok) throw new NotFoundError('Recipe line', String(query.lineIndex));
        return { status: 200 as const, body: result.resolution };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          return {
            status: 201 as const,
            body: { data: substitutionsService.createSubstitution(db, body) },
          };
        } catch (err) {
          if (err instanceof CannotSubstituteSelf) {
            throw new HttpError(400, err.message, undefined, 'common.validationFailed');
          }
          throw err;
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: substitutionsQueries.updateSubstitution(db, params.id, body) },
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        substitutionsService.deleteSubstitution(db, params.id);
        return { status: 200 as const, body: { ok: true as const } };
      }),
  };
}
