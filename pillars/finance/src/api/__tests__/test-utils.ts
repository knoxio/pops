/**
 * Supertest-backed REST client for the finance integration tests.
 *
 * Preserves a caller-shaped API (`client.wishlist.create({...})`,
 * `client.budgets.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` with the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { Budget } from '../modules/budgets-types.js';
import type { Transaction } from '../modules/transactions-types.js';
import type { WishListItem } from '../modules/wishlist-types.js';

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

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface TransactionSnapshot {
  id: string;
  notionId: string | null;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  checksum: string | null;
  rawRow: string | null;
  lastEditedTime: string;
}

export interface WishListQuery {
  search?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export interface BudgetQuery {
  search?: string;
  period?: string;
  active?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

export interface TransactionQuery {
  search?: string;
  account?: string;
  startDate?: string;
  endDate?: string;
  tag?: string;
  entityId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

interface TagSuggestion {
  tag: string;
  source: string;
  pattern?: string;
  isNew?: boolean;
}

interface TagRulePreview {
  counts: { affected: number; suggestionChanges: number; newTagProposals: number };
  affected: {
    transactionId: string;
    description: string;
    before: { suggestedTags: TagSuggestion[] };
    after: { suggestedTags: TagSuggestion[] };
  }[];
}

interface TagRuleProposal {
  changeSet: { source?: string; reason?: string; ops: unknown[] };
  rationale: string;
  preview: TagRulePreview;
}

interface TagRule {
  id: string;
  descriptionPattern: string;
  matchType: string;
  entityId: string | null;
  tags: string[];
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    wishlist: {
      list: (query: WishListQuery = {}) =>
        send<{ data: WishListItem[]; pagination: Pagination }>(r.get('/wishlist').query(query)),
      get: (id: string) => send<{ data: WishListItem }>(r.get(`/wishlist/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: WishListItem; message: string }>(r.post('/wishlist').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        send<{ data: WishListItem; message: string }>(r.patch(`/wishlist/${id}`).send(data)),
      delete: (id: string) => send<{ message: string }>(r.delete(`/wishlist/${id}`)),
    },
    budgets: {
      list: (query: BudgetQuery = {}) =>
        send<{ data: Budget[]; pagination: Pagination }>(r.get('/budgets').query(query)),
      get: (id: string) => send<{ data: Budget }>(r.get(`/budgets/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: Budget; message: string }>(r.post('/budgets').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        send<{ data: Budget; message: string }>(r.patch(`/budgets/${id}`).send(data)),
      delete: (id: string) => send<{ message: string }>(r.delete(`/budgets/${id}`)),
    },
    transactions: {
      list: (query: TransactionQuery = {}) =>
        send<{ data: Transaction[]; pagination: Pagination }>(r.get('/transactions').query(query)),
      get: (id: string) => send<{ data: Transaction }>(r.get(`/transactions/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: Transaction; message: string }>(r.post('/transactions').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        send<{ data: Transaction; message: string }>(r.patch(`/transactions/${id}`).send(data)),
      delete: (id: string) =>
        send<{ message: string; snapshot: TransactionSnapshot }>(r.delete(`/transactions/${id}`)),
      restore: (snapshot: TransactionSnapshot) =>
        send<{ data: Transaction; message: string }>(
          r.post('/transactions/restore').send(snapshot)
        ),
      suggestTags: (query: { description: string; entityId?: string }) =>
        send<{ tags: string[] }>(r.get('/transactions/suggest-tags').query(query)),
      descriptionsForPreview: (query: { limit?: number } = {}) =>
        send<{
          data: { description: string; checksum: string | null }[];
          total: number;
          truncated: boolean;
        }>(r.get('/transactions/descriptions-preview').query(query)),
      availableTags: () => send<{ tags: string[] }>(r.get('/transactions/available-tags')),
    },
    tagRules: {
      vocabulary: () => send<{ tags: string[] }>(r.get('/tag-rules/vocabulary')),
      propose: (body: Record<string, unknown>) =>
        send<TagRuleProposal>(r.post('/tag-rules/propose').send(body)),
      preview: (body: Record<string, unknown>) =>
        send<TagRulePreview>(r.post('/tag-rules/preview').send(body)),
      apply: (body: Record<string, unknown>) =>
        send<{ rules: TagRule[] }>(r.post('/tag-rules/apply').send(body)),
      reject: (body: Record<string, unknown>) =>
        send<{ message: string; followUpProposal: TagRuleProposal | null }>(
          r.post('/tag-rules/reject').send(body)
        ),
    },
  };
}
