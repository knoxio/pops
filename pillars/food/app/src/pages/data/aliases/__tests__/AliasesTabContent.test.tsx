/**
 * RTL coverage for the `/food/data/aliases` tab
 * (spec: pillars/food/docs/prds/data-page).
 *
 * The food SDK is mocked at the top level so vitest can hoist it. Each
 * SDK fn reads + records against the module-scoped `state` object so
 * tests can seed and assert via mutable handles. Mutations resolve
 * asynchronously, so call assertions are wrapped in `waitFor`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AliasWithTargetServer, SlugSearchHit } from './test-fixtures';

interface MutableState {
  items: AliasWithTargetServer[];
  lastListQuery: Record<string, unknown> | null;
  createCalls: Array<{ alias: string; target: { kind: string; id: number }; source?: string }>;
  updateTextCalls: Array<{ id: number; alias: string }>;
  deleteCalls: Array<{ id: number }>;
  mergeCalls: Array<{ aliasIds: number[]; target: { kind: string; id: number } }>;
  bulkApproveCalls: Array<{ aliasIds: number[] }>;
  slugMatches: SlugSearchHit[];
}

const state: MutableState = {
  items: [],
  lastListQuery: null,
  createCalls: [],
  updateTextCalls: [],
  deleteCalls: [],
  mergeCalls: [],
  bulkApproveCalls: [],
  slugMatches: [],
};

const aliasesListWithTargetsMock = vi.hoisted(() => vi.fn());
const aliasesCreateMock = vi.hoisted(() => vi.fn());
const aliasesUpdateTextMock = vi.hoisted(() => vi.fn());
const aliasesDeleteMock = vi.hoisted(() => vi.fn());
const aliasesMergeMock = vi.hoisted(() => vi.fn());
const aliasesBulkApproveMock = vi.hoisted(() => vi.fn());
const slugsSearchMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  aliasesListWithTargets: aliasesListWithTargetsMock,
  aliasesCreate: aliasesCreateMock,
  aliasesUpdateText: aliasesUpdateTextMock,
  aliasesDelete: aliasesDeleteMock,
  aliasesMerge: aliasesMergeMock,
  aliasesBulkApprove: aliasesBulkApproveMock,
  slugsSearch: slugsSearchMock,
  ingredientsGet: ingredientsGetMock,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AliasesTabContent } from '../AliasesTabContent';

function renderTab(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AliasesTabContent />
    </QueryClientProvider>
  );
}

const banana: AliasWithTargetServer = {
  alias: { id: 1, alias: 'platano', source: 'user', createdAt: '2026-06-01' },
  target: { kind: 'ingredient', id: 10, slug: 'banana', name: 'Banana' },
};
const llmAlias: AliasWithTargetServer = {
  alias: { id: 2, alias: 'bnana', source: 'llm', createdAt: '2026-06-02' },
  target: { kind: 'ingredient', id: 10, slug: 'banana', name: 'Banana' },
};
const variantAlias: AliasWithTargetServer = {
  alias: { id: 3, alias: 'maduro', source: 'user', createdAt: '2026-06-03' },
  target: {
    kind: 'variant',
    id: 99,
    slug: 'ripe',
    name: 'Ripe',
    parentIngredientSlug: 'banana',
    parentIngredientName: 'Banana',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.items = [banana, llmAlias, variantAlias];
  state.lastListQuery = null;
  state.createCalls.length = 0;
  state.updateTextCalls.length = 0;
  state.deleteCalls.length = 0;
  state.mergeCalls.length = 0;
  state.bulkApproveCalls.length = 0;
  state.slugMatches = [];

  aliasesListWithTargetsMock.mockImplementation(
    async (opts: { query?: Record<string, unknown> }) => {
      state.lastListQuery = opts.query ?? {};
      return { data: { items: state.items } };
    }
  );
  aliasesCreateMock.mockImplementation(
    async (opts: {
      body: { alias: string; target: { kind: string; id: number }; source?: string };
    }) => {
      state.createCalls.push(opts.body);
      return { data: {} };
    }
  );
  aliasesUpdateTextMock.mockImplementation(
    async (opts: { path: { id: number }; body: { alias: string } }) => {
      state.updateTextCalls.push({ id: opts.path.id, alias: opts.body.alias });
      return { data: {} };
    }
  );
  aliasesDeleteMock.mockImplementation(async (opts: { path: { id: number } }) => {
    state.deleteCalls.push({ id: opts.path.id });
    return { data: { ok: true } };
  });
  aliasesMergeMock.mockImplementation(
    async (opts: { body: { aliasIds: number[]; target: { kind: string; id: number } } }) => {
      state.mergeCalls.push(opts.body);
      return { data: { mergedCount: 1 } };
    }
  );
  aliasesBulkApproveMock.mockImplementation(async (opts: { body: { aliasIds: number[] } }) => {
    state.bulkApproveCalls.push(opts.body);
    return { data: { updatedCount: 1 } };
  });
  slugsSearchMock.mockImplementation(async () => ({ data: { items: state.slugMatches } }));
  ingredientsGetMock.mockImplementation(async () => ({
    data: { ingredient: {}, variants: [] },
  }));
});

describe('AliasesTabContent', () => {
  it('renders the description sub-line', async () => {
    renderTab();
    expect(await screen.findByText(/alternate names that resolve/i)).toBeInTheDocument();
  });

  it('lists every alias with its target label + slug', async () => {
    renderTab();
    expect(await screen.findByText('platano')).toBeInTheDocument();
    expect(screen.getByText('Banana — Ripe')).toBeInTheDocument();
    expect(screen.getByText('banana:ripe')).toBeInTheDocument();
  });

  it('toggles sort direction on repeated header clicks', async () => {
    renderTab();
    const user = userEvent.setup();
    const aliasHeader = await screen.findByRole('button', { name: /^alias/i });
    expect(aliasHeader.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    await user.click(aliasHeader);
    expect(aliasHeader.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('filters by source via the chip group', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('platano');
    await user.click(screen.getByRole('button', { name: /^llm$/i }));
    await waitFor(() => expect(state.lastListQuery).toMatchObject({ source: 'llm' }));
  });

  it('enables Merge only with ≥2 selections and opens the dialog', async () => {
    renderTab();
    const user = userEvent.setup();
    const merge = await screen.findByRole('button', { name: /^merge/i });
    expect(merge).toBeDisabled();
    await user.click(await screen.findByRole('checkbox', { name: /select alias platano/i }));
    await user.click(screen.getByRole('checkbox', { name: /select alias bnana/i }));
    expect(merge).toBeEnabled();
    await user.click(merge);
    expect(await screen.findByRole('dialog', { name: /merge aliases/i })).toBeInTheDocument();
  });

  it('enables Approve LLM when the selection contains an llm-sourced row', async () => {
    renderTab();
    const user = userEvent.setup();
    const approve = await screen.findByRole('button', { name: /approve llm/i });
    expect(approve).toBeDisabled();
    await user.click(await screen.findByRole('checkbox', { name: /select alias bnana/i }));
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() => expect(state.bulkApproveCalls.at(-1)).toEqual({ aliasIds: [2] }));
  });

  it('opens Add → submits a new alias against a picked ingredient', async () => {
    state.slugMatches = [{ slug: 'banana', kind: 'ingredient', targetId: 10, name: 'Banana' }];
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^add alias/i }));
    const dialog = await screen.findByRole('dialog', { name: /^add alias/i });
    await user.type(within(dialog).getByLabelText(/alias text/i), 'novo');
    await user.type(within(dialog).getByLabelText(/search ingredients/i), 'ban');
    await user.click(await within(dialog).findByRole('button', { name: /banana/i }));
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    await waitFor(() =>
      expect(state.createCalls.at(-1)).toMatchObject({
        alias: 'novo',
        source: 'user',
        target: { kind: 'ingredient', id: 10 },
      })
    );
  });

  it('fires a delete mutation when the row Delete button is clicked', async () => {
    renderTab();
    const user = userEvent.setup();
    const del = await screen.findByRole('button', { name: /delete alias platano/i });
    await user.click(del);
    await waitFor(() => expect(state.deleteCalls.at(-1)).toEqual({ id: 1 }));
  });

  it('renders the empty state when the server returns no rows', async () => {
    state.items = [];
    renderTab();
    expect(await screen.findByText(/no aliases yet/i)).toBeInTheDocument();
  });
});
