/**
 * RTL coverage for `/food/data/aliases` (PRD-122-C).
 *
 * `vi.mock('@pops/api-client', ...)` is declared at the top level so
 * vitest can hoist it (a helper function-wrapped mock works but
 * produces a deprecation warning). Each procedure's behaviour reads
 * from the module-scoped `state` object so tests can seed + assert
 * via mutable handles.
 */
import { render, screen, within } from '@testing-library/react';
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

function makeMutation<TArgs>(handler: (input: TArgs) => void) {
  return {
    useMutation: (opts?: { onSuccess?: () => void }) => ({
      mutate: (input: TArgs) => {
        handler(input);
        opts?.onSuccess?.();
      },
      isPending: false,
    }),
  };
}

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      food: {
        aliases: {
          list: { invalidate: () => Promise.resolve() },
          listWithTargets: { invalidate: () => Promise.resolve() },
        },
      },
    }),
    food: {
      aliases: {
        list: { useQuery: () => ({ data: undefined, isLoading: false, isError: false }) },
        listWithTargets: {
          useQuery: (input: Record<string, unknown>) => {
            state.lastListQuery = input;
            return { data: { items: state.items }, isLoading: false, isError: false };
          },
        },
        create: makeMutation((input: never) => state.createCalls.push(input)),
        updateText: makeMutation((input: never) => state.updateTextCalls.push(input)),
        delete: makeMutation((input: never) => state.deleteCalls.push(input)),
        merge: makeMutation((input: never) => state.mergeCalls.push(input)),
        bulkApprove: makeMutation((input: never) => state.bulkApproveCalls.push(input)),
      },
      ingredients: {
        get: { useQuery: () => ({ data: { variants: [] }, isLoading: false, isError: false }) },
      },
      slugs: {
        search: {
          useQuery: () => ({
            data: { items: state.slugMatches },
            isLoading: false,
            isError: false,
          }),
        },
      },
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AliasesTabContent } from '../AliasesTabContent';

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
  state.items = [banana, llmAlias, variantAlias];
  state.lastListQuery = null;
  state.createCalls.length = 0;
  state.updateTextCalls.length = 0;
  state.deleteCalls.length = 0;
  state.mergeCalls.length = 0;
  state.bulkApproveCalls.length = 0;
  state.slugMatches = [];
});

describe('AliasesTabContent', () => {
  it('renders the description sub-line', async () => {
    render(<AliasesTabContent />);
    expect(await screen.findByText(/alternate names that resolve/i)).toBeInTheDocument();
  });

  it('lists every alias with its target label + slug', async () => {
    render(<AliasesTabContent />);
    expect(await screen.findByText('platano')).toBeInTheDocument();
    expect(screen.getByText('Banana — Ripe')).toBeInTheDocument();
    expect(screen.getByText('banana:ripe')).toBeInTheDocument();
  });

  it('toggles sort direction on repeated header clicks', async () => {
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    const aliasHeader = await screen.findByRole('button', { name: /^alias/i });
    expect(aliasHeader.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    await user.click(aliasHeader);
    expect(aliasHeader.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('filters by source via the chip group', async () => {
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    await screen.findByText('platano');
    await user.click(screen.getByRole('button', { name: /^llm$/i }));
    expect(state.lastListQuery).toMatchObject({ source: 'llm' });
  });

  it('enables Merge only with ≥2 selections and opens the dialog', async () => {
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    const merge = await screen.findByRole('button', { name: /^merge/i });
    expect(merge).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /select alias platano/i }));
    await user.click(screen.getByRole('checkbox', { name: /select alias bnana/i }));
    expect(merge).toBeEnabled();
    await user.click(merge);
    expect(await screen.findByRole('dialog', { name: /merge aliases/i })).toBeInTheDocument();
  });

  it('enables Approve LLM when the selection contains an llm-sourced row', async () => {
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    const approve = await screen.findByRole('button', { name: /approve llm/i });
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /select alias bnana/i }));
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(state.bulkApproveCalls.at(-1)).toEqual({ aliasIds: [2] });
  });

  it('opens Add → submits a new alias against a picked ingredient', async () => {
    state.slugMatches = [{ slug: 'banana', kind: 'ingredient', targetId: 10, name: 'Banana' }];
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^add alias/i }));
    const dialog = await screen.findByRole('dialog', { name: /^add alias/i });
    await user.type(within(dialog).getByLabelText(/alias text/i), 'novo');
    await user.type(within(dialog).getByLabelText(/search ingredients/i), 'ban');
    await user.click(await within(dialog).findByRole('button', { name: /banana/i }));
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(state.createCalls.at(-1)).toMatchObject({
      alias: 'novo',
      source: 'user',
      target: { kind: 'ingredient', id: 10 },
    });
  });

  it('fires a delete mutation when the row Delete button is clicked', async () => {
    render(<AliasesTabContent />);
    const user = userEvent.setup();
    const del = await screen.findByRole('button', { name: /delete alias platano/i });
    await user.click(del);
    expect(state.deleteCalls.at(-1)).toEqual({ id: 1 });
  });

  it('renders the empty state when the server returns no rows', async () => {
    state.items = [];
    render(<AliasesTabContent />);
    expect(await screen.findByText(/no aliases yet/i)).toBeInTheDocument();
  });
});
