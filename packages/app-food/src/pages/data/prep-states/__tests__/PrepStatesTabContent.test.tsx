/**
 * RTL coverage for `/food/data/prep-states` (PRD-122-C / Tab 3).
 *
 * The tab is read-only beyond Add; the test confirms:
 *   - description renders in the header
 *   - rows render in slug-sorted order
 *   - the row Delete button is disabled and the tooltip text is wired up
 *   - the Add dialog submits via `food.prepStates.create`
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PrepStateServerRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

interface PrepStatesMockApi {
  items: PrepStateServerRow[];
  createCalls: Array<{ slug: string; name: string }>;
}

let current: PrepStatesMockApi | null = null;
function ensure(): PrepStatesMockApi {
  current ??= { items: [], createCalls: [] };
  return current;
}

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'prepStates.list') {
      return { data: { items: ensure().items }, isLoading: false, isError: false };
    }
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts?: { onSuccess?: () => void }
  ) => {
    const key = path.join('.');
    if (key === 'prepStates.create') {
      return {
        mutate: (input: unknown) => {
          ensure().createCalls.push(input as never);
          opts?.onSuccess?.();
        },
        mutateAsync: vi.fn(),
        isPending: false,
      };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: () => Promise.resolve(),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PrepStatesTabContent } from '../PrepStatesTabContent';

beforeEach(() => {
  current = { items: [], createCalls: [] };
});

describe('PrepStatesTabContent', () => {
  it('renders the description header', async () => {
    render(<PrepStatesTabContent />);
    expect(await screen.findByText(/knife and process modifiers/i)).toBeInTheDocument();
  });

  it('sorts rows alphabetically by slug', async () => {
    ensure().items = [
      { id: 1, slug: 'sliced', name: 'Sliced' },
      { id: 2, slug: 'diced', name: 'Diced' },
      { id: 3, slug: 'grated', name: 'Grated' },
    ];
    render(<PrepStatesTabContent />);
    const rows = await screen.findAllByTestId(/prep-state-row-/);
    // First cell of each row holds the slug (font-mono).
    const slugs = rows.map((row) => row.firstElementChild?.textContent ?? '');
    expect(slugs).toEqual(['diced', 'grated', 'sliced']);
  });

  it('marks every row Delete button as aria-disabled with an explanatory tooltip', async () => {
    ensure().items = [{ id: 1, slug: 'diced', name: 'Diced' }];
    render(<PrepStatesTabContent />);
    const del = (await screen.findAllByRole('button', { name: /delete disabled/i }))[0];
    // Per the keyboard-accessibility fix: the button is focusable
    // (`aria-disabled` instead of HTML `disabled`) so the tooltip can
    // appear on focus. Click is no-op'd via onClick.
    expect(del.getAttribute('aria-disabled')).toBe('true');
    expect(del).not.toBeDisabled();
    expect(screen.getByLabelText(/delete disabled — see tooltip/i)).toBeInTheDocument();
  });

  it('renders the empty state when no rows', async () => {
    render(<PrepStatesTabContent />);
    expect(await screen.findByText(/no prep states yet/i)).toBeInTheDocument();
  });

  it('opens Add → submits slug + name to the create mutation', async () => {
    render(<PrepStatesTabContent />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add prep state/i }));
    const dialog = await screen.findByRole('dialog', { name: /add prep state/i });
    await user.type(within(dialog).getByLabelText(/^slug$/i), 'diced');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Diced');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(ensure().createCalls.at(-1)).toEqual({ slug: 'diced', name: 'Diced' });
  });

  it('disables Add submit until both slug and name are non-empty', async () => {
    render(<PrepStatesTabContent />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add prep state/i }));
    const dialog = await screen.findByRole('dialog', { name: /add prep state/i });
    const submit = within(dialog).getByRole('button', { name: /^add$/i });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^slug$/i), 'diced');
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Diced');
    expect(submit).toBeEnabled();
  });
});
