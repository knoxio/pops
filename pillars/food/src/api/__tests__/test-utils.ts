/**
 * Supertest-backed REST client for the food pillar integration tests.
 *
 * Preserves the caller-shaped API the old tRPC tests used
 * (`client.conversions.createUnit({...})`) so per-test bodies stay
 * readable — only the transport changed. Non-2xx responses throw
 * `HttpError` with the parsed `{ status, body }` so tests assert on
 * `.rejects.toMatchObject({ status })` instead of the old TRPCError code.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { IngredientWeight, UnitConversion } from '../modules/conversions/types.js';

interface PrepState {
  id: number;
  name: string;
  slug: string;
}

interface IngredientVariant {
  id: number;
  ingredientId: number;
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG: number | null;
  notes: string | null;
  defaultShelfLifeDaysFridge: number | null;
  defaultShelfLifeDaysFreezer: number | null;
  createdAt: string;
}

interface SlugMatch {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
  name: string;
}

interface CreateVariantBody {
  ingredientId: number;
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG?: number | null;
  notes?: string | null;
}

type AliasSource = 'user' | 'llm' | 'ingest';
type AliasTarget = { kind: 'ingredient' | 'variant'; id: number };

interface IngredientAlias {
  id: number;
  ingredientId: number | null;
  variantId: number | null;
  alias: string;
  source: AliasSource;
  createdAt: string;
}

type TagOpResult =
  | { ok: true }
  | { ok: false; reason: 'BadTagFormat' | 'TagTooLong' | 'IngredientNotFound' };

interface Ingredient {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  densityGPerMl: number | null;
  notes: string | null;
  createdAt: string;
}

interface DeleteBlockerSummary {
  variants: number;
  aliases: number;
}

type IngredientDeleteResult = { ok: true } | { ok: false; blockers: DeleteBlockerSummary };

interface CreateIngredientBody {
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  parentId?: number | null;
  densityGPerMl?: number | null;
  notes?: string | null;
}

type SubEndpoint = { ingredientId?: number; variantId?: number };

interface SubstitutionView {
  id: number;
  fromIngredientId: number | null;
  toIngredientId: number | null;
  ratio: number;
  contextTags: readonly string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  notes: string | null;
  createdAt: string;
}

interface GraphView {
  nodes: { id: string; kind: 'ingredient' | 'variant' }[];
  edges: { id: number; fromNodeId: string; toNodeId: string }[];
}

interface SolveResult {
  totalCandidates: number;
  cookableCount: number;
  recipes: unknown[];
}

type BatchLoc = 'pantry' | 'fridge' | 'freezer' | 'other';
type BatchMutationResult = { ok: true } | { ok: false; reason: string };
type BatchAdjustResult = { ok: true; newQty: number } | { ok: false; reason: string };

interface BatchDetail {
  id: number;
  variantId: number;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  location: BatchLoc;
  sourceType: string;
  expiresAt: string | null;
  notes: string | null;
  deletedAt: string | null;
}

interface CreateBatchBody {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: 'g' | 'ml' | 'count';
  location: BatchLoc;
  sourceType: 'purchase' | 'gift' | 'other';
  producedAt?: string;
  expiresAt?: string;
  notes?: string;
}

interface FridgeView {
  sections: { location: BatchLoc; count: number; ingredients: unknown[] }[];
  counts: { visible: number; empty: number; deleted: number };
}

type ApproveResult =
  | { ok: true; recipeSlug: string; promotedVersionNo: number }
  | { ok: false; reason: string };
type SimpleOkResult = { ok: true } | { ok: false; reason: string };
type InspectorResult = { ok: true; review: unknown } | { ok: false; reason: 'SourceNotFound' };
interface ListPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface RecipeListItem {
  id: number;
  slug: string;
  title: string | null;
}
type PromoteResult = { ok: true; versionId: number } | { ok: false; reason: string };
interface CreateRecipeResult {
  slug: string;
  recipeId: number;
  versionId: number;
  compile: unknown;
}

interface UploadHeroResult {
  heroImagePath: string;
  sizeBytes: number;
  width: number;
  height: number;
}

interface SendPreview {
  recipeTitle: string;
  scaleFactor: number;
  canonicalItems: unknown[];
  unconvertedItems: unknown[];
  alreadySentToListIds: number[];
}
type SendTarget = { kind: 'existing'; listId: number } | { kind: 'new'; name: string };
type SendToListResult =
  | { ok: true; listId: number; addedCount: number; mergedCount: number }
  | { ok: false; reason: string };

interface WeekView {
  weekStart: string;
  weekEnd: string;
  slots: { slug: string; name: string }[];
  entries: { id: number; recipeId: number; slot: string }[];
}
type OkOr<R extends string> = { ok: true } | { ok: false; reason: R };
type AddEntryResult = { ok: true; id: number; position: number } | { ok: false; reason: string };

interface GeneratorPreview {
  startDate: string;
  endDate: string;
  planEntryCount: number;
  skippedPlanEntryCount: number;
  sections: { sectionLabel: string; items: { ingredientId: number; buyQty: number }[] }[];
  recipeTitles: string[];
}
type GenerateResult =
  | { ok: true; listId: number; itemCount: number }
  | { ok: false; reason: string };

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

type DeleteResult = { ok: true } | { ok: false; reason: 'seeded' };

type ResolveResult =
  | { kind: 'resolved'; canonicalUnit: 'g' | 'ml' | 'count'; qty: number }
  | { kind: 'unresolved' };

interface CreateUnitBody {
  fromUnit: string;
  toUnit: 'g' | 'ml' | 'count';
  ratio: number;
  notes?: string;
}

interface CreateWeightBody {
  ingredientId: number;
  variantId?: number | null;
  unit: string;
  grams: number;
  notes?: string;
}

interface LogInferenceBody {
  operation: string;
  contextId: string;
  provider: 'claude';
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  cached: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    ai: {
      logInference: (body: LogInferenceBody, token?: string) => {
        const req = r.post('/ai/log-inference');
        if (token !== undefined) req.set('x-pops-internal-token', token);
        return send<{ ok: true }>(req.send(body));
      },
    },
    conversions: {
      listUnits: (query: { search?: string; seededOnly?: boolean } = {}) =>
        send<{ items: UnitConversion[] }>(r.get('/conversions/units').query(query)),
      createUnit: (body: CreateUnitBody) =>
        send<{ data: UnitConversion }>(r.post('/conversions/units').send(body)),
      updateUnit: (id: number, body: { ratio?: number; notes?: string | null }) =>
        send<{ data: UnitConversion }>(r.patch(`/conversions/units/${id}`).send(body)),
      deleteUnit: (id: number) => send<DeleteResult>(r.delete(`/conversions/units/${id}`)),
      listWeights: (query: { ingredientId?: number; search?: string; seededOnly?: boolean } = {}) =>
        send<{ items: IngredientWeight[] }>(r.get('/conversions/weights').query(query)),
      createWeight: (body: CreateWeightBody) =>
        send<{ data: IngredientWeight }>(r.post('/conversions/weights').send(body)),
      updateWeight: (id: number, body: { grams?: number; notes?: string | null }) =>
        send<{ data: IngredientWeight }>(r.patch(`/conversions/weights/${id}`).send(body)),
      deleteWeight: (id: number) => send<DeleteResult>(r.delete(`/conversions/weights/${id}`)),
      resolve: (query: { ingredientId: number; variantId?: number; unit: string; qty: number }) =>
        send<ResolveResult>(r.get('/conversions/resolve').query(query)),
    },
    prepStates: {
      list: () => send<{ items: PrepState[] }>(r.get('/prep-states')),
      create: (body: { slug: string; name: string }) =>
        send<{ data: PrepState }>(r.post('/prep-states').send(body)),
    },
    slugs: {
      search: (query: {
        query: string;
        kinds?: ('ingredient' | 'recipe' | 'prep_state')[];
        limit?: number;
      }) => send<{ items: SlugMatch[] }>(r.get('/slugs/search').query(query)),
    },
    variants: {
      create: (body: CreateVariantBody) =>
        send<{ data: IngredientVariant }>(r.post('/variants').send(body)),
      update: (id: number, body: { name?: string; slug?: string; packageSizeG?: number | null }) =>
        send<{ data: IngredientVariant }>(r.patch(`/variants/${id}`).send(body)),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/variants/${id}`)),
    },
    ingredientTags: {
      list: (ingredientId: number) =>
        send<{ tags: string[] }>(r.get('/ingredient-tags').query({ ingredientId })),
      distinct: (query: { namespacePrefix?: string; limit?: number } = {}) =>
        send<{ tags: { tag: string; ingredientCount: number; firstSeenAt: string }[] }>(
          r.get('/ingredient-tags/distinct').query(query)
        ),
      byTag: (tag: string) =>
        send<{ ingredients: { id: number; slug: string; name: string }[] }>(
          r.get('/ingredient-tags/by-tag').query({ tag })
        ),
      set: (ingredientId: number, tags: string[]) =>
        send<TagOpResult>(r.put(`/ingredient-tags/${ingredientId}`).send({ tags })),
    },
    aliases: {
      list: (query: { search?: string; source?: AliasSource } = {}) =>
        send<{ items: IngredientAlias[] }>(r.get('/aliases').query(query)),
      listWithTargets: (query: { search?: string } = {}) =>
        send<{ items: unknown[] }>(r.get('/aliases/with-targets').query(query)),
      create: (body: { alias: string; target: AliasTarget; source?: AliasSource }) =>
        send<{ data: IngredientAlias }>(r.post('/aliases').send(body)),
      updateText: (id: number, alias: string) =>
        send<{ data: IngredientAlias }>(r.patch(`/aliases/${id}`).send({ alias })),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/aliases/${id}`)),
      merge: (aliasIds: number[], target: AliasTarget) =>
        send<{ mergedCount: number }>(r.post('/aliases/merge').send({ aliasIds, target })),
      bulkApprove: (aliasIds: number[]) =>
        send<{ updatedCount: number }>(r.post('/aliases/bulk-approve').send({ aliasIds })),
    },
    ingredients: {
      list: (query: { search?: string; parentId?: number } = {}) =>
        send<{ items: Ingredient[] }>(r.get('/ingredients').query(query)),
      get: (idOrSlug: number | string) =>
        send<{ ingredient: Ingredient; variants: IngredientVariant[] }>(
          r.get(`/ingredients/${idOrSlug}`)
        ),
      create: (body: CreateIngredientBody) =>
        send<{ data: Ingredient }>(r.post('/ingredients').send(body)),
      update: (
        id: number,
        body: { name?: string; defaultUnit?: 'g' | 'ml' | 'count'; notes?: string | null }
      ) => send<{ data: Ingredient }>(r.patch(`/ingredients/${id}`).send(body)),
      rename: (oldSlug: string, newSlug: string) =>
        send<{ data: Ingredient }>(r.post('/ingredients/rename').send({ oldSlug, newSlug })),
      changeParent: (id: number, newParentId: number | null) =>
        send<{ data: Ingredient }>(r.post(`/ingredients/${id}/parent`).send({ newParentId })),
      blockers: (id: number) =>
        send<{ data: DeleteBlockerSummary }>(r.get(`/ingredients/${id}/blockers`)),
      recipeRefs: (id: number) =>
        send<{ count: number; recipes: unknown[] }>(r.get(`/ingredients/${id}/recipe-refs`)),
      delete: (id: number) => send<IngredientDeleteResult>(r.delete(`/ingredients/${id}`)),
    },
    substitutions: {
      list: (query: { scope?: 'global' | 'recipe'; recipeId?: number } = {}) =>
        send<{ items: SubstitutionView[] }>(r.get('/substitutions').query(query)),
      graphView: (query: { scope?: 'global' | 'recipe'; recipeId?: number } = {}) =>
        send<GraphView>(r.get('/substitutions/graph-view').query(query)),
      resolveForLine: (recipeVersionId: number, lineIndex: number) =>
        send<unknown>(r.get('/substitutions/resolve-line').query({ recipeVersionId, lineIndex })),
      create: (body: {
        from: SubEndpoint;
        to: SubEndpoint;
        ratio?: number;
        contextTags?: string[];
        scope?: 'global' | 'recipe';
        recipeId?: number | null;
        notes?: string | null;
      }) => send<{ data: SubstitutionView }>(r.post('/substitutions').send(body)),
      update: (id: number, body: { ratio?: number; notes?: string | null }) =>
        send<{ data: SubstitutionView }>(r.patch(`/substitutions/${id}`).send(body)),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/substitutions/${id}`)),
    },
    solver: {
      canICook: (
        body: {
          excludeSubs?: boolean;
          recipeTypes?: string[];
          tags?: string[];
          maxMinutes?: number;
        } = {}
      ) => send<SolveResult>(r.post('/solver/can-i-cook').send(body)),
    },
    batches: {
      create: (body: CreateBatchBody) => send<{ batchId: number }>(r.post('/batches').send(body)),
      get: (id: number) => send<{ data: BatchDetail }>(r.get(`/batches/${id}`)),
      relocate: (id: number, location: BatchLoc) =>
        send<BatchMutationResult>(r.post(`/batches/${id}/relocate`).send({ location })),
      edit: (
        id: number,
        body: { expiresAt?: string | null; notes?: string | null; prepStateId?: number | null }
      ) => send<BatchMutationResult>(r.patch(`/batches/${id}`).send(body)),
      adjustQty: (id: number, delta: number, reason: 'spoiled' | 'wasted' | 'correction') =>
        send<BatchAdjustResult>(r.post(`/batches/${id}/adjust`).send({ delta, reason })),
      delete: (id: number) => send<BatchMutationResult>(r.delete(`/batches/${id}`)),
      searchForConsume: (
        body: { variantId?: number; ingredientId?: number; location?: BatchLoc } = {}
      ) =>
        send<{ items: { id: number; variantId: number }[] }>(
          r.post('/batches/search-for-consume').send(body)
        ),
    },
    fridge: {
      view: (
        body: {
          search?: string;
          locations?: BatchLoc[];
          includeEmpty?: boolean;
          includeDeleted?: boolean;
        } = {}
      ) => send<FridgeView>(r.post('/fridge/view').send(body)),
      recipesUsingBatch: (batchId: number, limit?: number) =>
        send<{ items: unknown[] }>(r.get('/fridge/recipes-using-batch').query({ batchId, limit })),
    },
    inbox: {
      approve: (versionId: number) =>
        send<ApproveResult>(r.post('/inbox/approve').send({ versionId })),
      reject: (versionId: number, reason: string, note?: string | null) =>
        send<SimpleOkResult>(r.post('/inbox/reject').send({ versionId, reason, note })),
      unreject: (versionId: number) =>
        send<SimpleOkResult>(r.post('/inbox/unreject').send({ versionId })),
      list: (body: { limit?: number; cursor?: string } = {}) =>
        send<ListPage<{ versionId: number }>>(r.post('/inbox/list').send(body)),
      listRejected: (body: { limit?: number } = {}) =>
        send<ListPage<{ versionId: number }>>(r.post('/inbox/rejected').send(body)),
      listFailed: (body: { limit?: number } = {}) =>
        send<ListPage<{ sourceId: number }>>(r.post('/inbox/failed').send(body)),
      failedErrorCodes: () => send<{ items: string[] }>(r.get('/inbox/failed/error-codes')),
      pendingCount: () => send<{ count: number }>(r.get('/inbox/pending-count')),
      getForReview: (sourceId: number) =>
        send<InspectorResult>(r.get('/inbox/review').query({ sourceId })),
    },
    recipes: {
      list: (body: { search?: string; includeDraftOnly?: boolean } = {}) =>
        send<{ items: RecipeListItem[]; nextCursor: string | null }>(
          r.post('/recipes/search').send(body)
        ),
      create: (dsl: string) => send<CreateRecipeResult>(r.post('/recipes').send({ dsl })),
      getForRendering: (slug: string, versionNo?: number) =>
        send<unknown>(r.get(`/recipes/${slug}`).query(versionNo ? { versionNo } : {})),
      listDrafts: (slug: string) =>
        send<{ drafts: { versionId: number; versionNo: number }[] }>(
          r.get(`/recipes/${slug}/drafts`)
        ),
      createNewDraft: (slug: string) =>
        send<{ versionId: number; versionNo: number }>(r.post(`/recipes/${slug}/drafts`).send({})),
      archiveRecipe: (slug: string) =>
        send<{ ok: true }>(r.post(`/recipes/${slug}/archive`).send({})),
      saveDraft: (versionId: number, dsl: string) =>
        send<{ compile: unknown }>(r.patch(`/recipes/versions/${versionId}`).send({ dsl })),
      promote: (versionId: number) =>
        send<PromoteResult>(r.post(`/recipes/versions/${versionId}/promote`).send({})),
      archiveVersion: (versionId: number) =>
        send<{ ok: true }>(r.post(`/recipes/versions/${versionId}/archive`).send({})),
      restoreVersion: (versionId: number) =>
        send<{ newVersionId: number; newVersionNo: number }>(
          r.post(`/recipes/versions/${versionId}/restore`).send({})
        ),
      listProposedSlugs: (versionId: number) =>
        send<{ items: unknown[] }>(r.get(`/recipes/versions/${versionId}/proposed-slugs`)),
    },
    heroImage: {
      upload: (recipeId: number, mimeType: string, contentBase64: string) =>
        send<{ data: UploadHeroResult; message: string }>(
          r.post(`/recipes/${recipeId}/hero-image`).send({ mimeType, contentBase64 })
        ),
      remove: (recipeId: number) =>
        send<{ ok: true; message: string }>(r.delete(`/recipes/${recipeId}/hero-image`)),
    },
    sendToList: {
      prepare: (versionId: number, scaleFactor?: number) =>
        send<SendPreview>(
          r
            .get(`/recipes/versions/${versionId}/send-to-list/preview`)
            .query(scaleFactor === undefined ? {} : { scaleFactor })
        ),
      send: (versionId: number, target: SendTarget, scaleFactor?: number) =>
        send<SendToListResult>(
          r.post(`/recipes/versions/${versionId}/send-to-list`).send({ target, scaleFactor })
        ),
    },
    plan: {
      weekView: (weekStart: string) => send<WeekView>(r.get('/plan/week').query({ weekStart })),
      listSlots: () => send<{ slots: { slug: string; name: string }[] }>(r.get('/plan/slots')),
      addSlot: (slug: string, name: string) =>
        send<OkOr<'SlugTaken' | 'SlugInvalid'>>(r.post('/plan/slots').send({ slug, name })),
      updateSlot: (slug: string, body: { name?: string; displayOrder?: number }) =>
        send<OkOr<'SlotNotFound' | 'CannotEditDefault'>>(r.patch(`/plan/slots/${slug}`).send(body)),
      deleteSlot: (slug: string) =>
        send<OkOr<'SlotNotFound' | 'CannotDeleteDefault' | 'SlotInUse'>>(
          r.delete(`/plan/slots/${slug}`)
        ),
      addEntry: (body: { date: string; slot: string; recipeId: number; plannedServings: number }) =>
        send<AddEntryResult>(r.post('/plan/entries').send(body)),
      updateEntry: (id: number, body: { plannedServings?: number; notes?: string | null }) =>
        send<OkOr<string>>(r.patch(`/plan/entries/${id}`).send(body)),
      moveEntry: (id: number, date: string, slot: string) =>
        send<OkOr<string>>(r.post(`/plan/entries/${id}/move`).send({ date, slot })),
      deleteEntry: (id: number) => send<OkOr<string>>(r.delete(`/plan/entries/${id}`)),
    },
    shopping: {
      preview: (startDate: string, endDate: string) =>
        send<GeneratorPreview>(r.post('/shopping/preview').send({ startDate, endDate })),
      generate: (startDate: string, endDate: string, listName: string) =>
        send<GenerateResult>(r.post('/shopping/generate').send({ startDate, endDate, listName })),
    },
  };
}
