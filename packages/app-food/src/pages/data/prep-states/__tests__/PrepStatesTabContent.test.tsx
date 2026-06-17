/**
 * RTL coverage for `/food/data/prep-states` (PRD-122-C / Tab 3).
 *
 * The tab is read-only beyond Add; the test confirms:
 *   - description renders in the header
 *   - rows render in slug-sorted order
 *   - the row Delete button is disabled and the tooltip text is wired up
 *   - the Add dialog submits via `food.prepStates.create`
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const prepStatesListMock = vi.hoisted(() => vi.fn());
const prepStatesCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  prepStatesList: prepStatesListMock,
  prepStatesCreate: prepStatesCreateMock,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PrepStatesTabContent } from '../PrepStatesTabContent';

function renderTab(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PrepStatesTabContent />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  current = { items: [], createCalls: [] };
  prepStatesListMock.mockImplementation(async () => ({ data: { items: ensure().items } }));
  prepStatesCreateMock.mockImplementation(
    async (opts: { body: { slug: string; name: string } }) => {
      ensure().createCalls.push(opts.body);
      return { data: { id: 1, ...opts.body } };
    }
  );
});

describe('PrepStatesTabContent', () => {
  it('renders the description header', async () => {
    renderTab();
    expect(await screen.findByText(/knife and process modifiers/i)).toBeInTheDocument();
  });

  it('sorts rows alphabetically by slug', async () => {
    ensure().items = [
      { id: 1, slug: 'sliced', name: 'Sliced' },
      { id: 2, slug: 'diced', name: 'Diced' },
      { id: 3, slug: 'grated', name: 'Grated' },
    ];
    renderTab();
    const rows = await screen.findAllByTestId(/prep-state-row-/);
    // First cell of each row holds the slug (font-mono).
    const slugs = rows.map((row) => row.firstElementChild?.textContent ?? '');
    expect(slugs).toEqual(['diced', 'grated', 'sliced']);
  });

  it('marks every row Delete button as aria-disabled with an explanatory tooltip', async () => {
    ensure().items = [{ id: 1, slug: 'diced', name: 'Diced' }];
    renderTab();
    const del = (await screen.findAllByRole('button', { name: /delete disabled/i }))[0];
    // Per the keyboard-accessibility fix: the button is focusable
    // (`aria-disabled` instead of HTML `disabled`) so the tooltip can
    // appear on focus. Click is no-op'd via onClick.
    expect(del.getAttribute('aria-disabled')).toBe('true');
    expect(del).not.toBeDisabled();
    expect(screen.getByLabelText(/delete disabled — see tooltip/i)).toBeInTheDocument();
  });

  it('renders the empty state when no rows', async () => {
    renderTab();
    expect(await screen.findByText(/no prep states yet/i)).toBeInTheDocument();
  });

  it('opens Add → submits slug + name to the create mutation', async () => {
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add prep state/i }));
    const dialog = await screen.findByRole('dialog', { name: /add prep state/i });
    await user.type(within(dialog).getByLabelText(/^slug$/i), 'diced');
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Diced');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    await waitFor(() =>
      expect(ensure().createCalls.at(-1)).toEqual({ slug: 'diced', name: 'Diced' })
    );
  });

  it('disables Add submit until both slug and name are non-empty', async () => {
    renderTab();
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
