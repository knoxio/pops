import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  CannotSubstituteSelf,
  substitutionsGraph,
  substitutionsHydrate,
  substitutionsQueries,
  substitutionsService,
  type GraphViewEdgeRow,
  type GraphViewSide,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * Graph-view composite id. Encodes the side as `ingredient:<id>` or
 * `variant:<id>` so the client can dedupe nodes across edges without
 * doing any schema reasoning. Throws on a malformed side (`kind='variant'`
 * without a `variantId`) rather than silently coercing to `variant:0`,
 * which would collide across edges and hide a schema-drift bug.
 */
function sideToNodeId(side: GraphViewSide): string {
  if (side.kind === 'variant') {
    if (side.variantId === null) {
      throw new Error(
        `graphView: variant side missing variantId (CHECK drift on ingredient ${side.ingredientId})`
      );
    }
    return `variant:${side.variantId}`;
  }
  return `ingredient:${side.ingredientId}`;
}

/** Compose the minimum spanning subgraph of nodes that any edge touches. */
function deriveNodes(edges: GraphViewEdgeRow[]): GraphViewNode[] {
  const byId = new Map<string, GraphViewNode>();
  for (const edge of edges) {
    for (const side of [edge.fromSide, edge.toSide]) {
      const id = sideToNodeId(side);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        kind: side.kind,
        ingredientId: side.ingredientId,
        variantId: side.variantId,
        ingredientSlug: side.ingredientSlug,
        ingredientName: side.ingredientName,
        variantSlug: side.variantSlug,
        variantName: side.variantName,
      });
    }
  }
  return [...byId.values()];
}

export interface GraphViewNode {
  id: string;
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
}

export interface GraphViewEdge {
  id: number;
  fromNodeId: string;
  toNodeId: string;
  ratio: number;
  contextTags: readonly string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  recipeSlug: string | null;
  notes: string | null;
}

export interface GraphView {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
}

/**
 * Endpoints are XOR-shaped: exactly one of `ingredientId` / `variantId` on
 * each side. Validating at the boundary makes client mistakes surface as
 * BAD_REQUEST instead of a 500 after the SQLite CHECK fires. Scope/recipeId
 * coherence (`recipe` iff `recipeId` set) is enforced here too.
 */

const ENDPOINT_SCHEMA = z
  .object({
    ingredientId: z.number().optional(),
    variantId: z.number().optional(),
  })
  .refine(
    (v) =>
      (v.ingredientId !== undefined && v.variantId === undefined) ||
      (v.ingredientId === undefined && v.variantId !== undefined),
    { message: 'endpoint must set exactly one of ingredientId or variantId' }
  );

const SCOPE_ENUM = z.enum(['global', 'recipe']);

const CREATE_INPUT = z
  .object({
    from: ENDPOINT_SCHEMA,
    to: ENDPOINT_SCHEMA,
    ratio: z.number().positive().optional(),
    contextTags: z.array(z.string()).optional(),
    scope: SCOPE_ENUM.optional(),
    recipeId: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (v) => {
      const scope = v.scope ?? 'global';
      if (scope === 'recipe') return v.recipeId !== undefined && v.recipeId !== null;
      return v.recipeId === undefined || v.recipeId === null;
    },
    { message: 'scope="recipe" requires recipeId; scope="global" must omit recipeId' }
  );

const UPDATE_INPUT = z
  .object({
    id: z.number(),
    ratio: z.number().positive().optional(),
    contextTags: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'id' && v[k as keyof typeof v] !== undefined), {
    message: 'patch must include at least one field besides id',
  });

const GRAPH_VIEW_INPUT = z
  .object({
    scope: SCOPE_ENUM.optional(),
    recipeId: z.number().optional(),
    contextTag: z.string().optional(),
    search: z.string().optional(),
  })
  .refine((v) => (v.scope === 'recipe' ? v.recipeId !== undefined : true), {
    message: 'scope="recipe" requires recipeId',
  });

export const substitutionsRouter = router({
  graphView: protectedProcedure.input(GRAPH_VIEW_INPUT.optional()).query(({ input }): GraphView => {
    const filter = input ?? {};
    const { edges: hydrated } = substitutionsGraph.loadGraphView(getDrizzle(), filter);
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
    const nodes = deriveNodes(hydrated);
    return { nodes, edges };
  }),

  list: protectedProcedure
    .input(
      z
        .object({
          fromIngredientId: z.number().optional(),
          fromVariantId: z.number().optional(),
          toIngredientId: z.number().optional(),
          toVariantId: z.number().optional(),
          scope: SCOPE_ENUM.optional(),
          recipeId: z.number().optional(),
          contextTag: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => ({
      items: substitutionsQueries.listSubstitutions(getDrizzle(), input ?? {}),
    })),

  listHydrated: protectedProcedure
    .input(
      z
        .object({
          fromIngredientId: z.number().optional(),
          fromVariantId: z.number().optional(),
          toIngredientId: z.number().optional(),
          toVariantId: z.number().optional(),
          scope: SCOPE_ENUM.optional(),
          recipeId: z.number().optional(),
          contextTag: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => ({
      items: substitutionsHydrate.listSubstitutionsHydrated(getDrizzle(), input ?? {}),
    })),

  create: protectedProcedure.input(CREATE_INPUT).mutation(({ input }) => {
    try {
      return substitutionsService.createSubstitution(getDrizzle(), input);
    } catch (err) {
      if (err instanceof CannotSubstituteSelf) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      }
      throw err as Error;
    }
  }),

  update: protectedProcedure.input(UPDATE_INPUT).mutation(({ input }) => {
    const { id, ...patch } = input;
    return substitutionsQueries.updateSubstitution(getDrizzle(), id, patch);
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    substitutionsService.deleteSubstitution(getDrizzle(), input.id);
    return { ok: true as const };
  }),
});
