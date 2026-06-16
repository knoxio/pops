import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ItemsDistinctTypesResponses,
  ItemsListResponses,
  ItemsSearchByAssetIdResponses,
  LocationTreeNode,
  LocationsTreeResponses,
} from '../inventory-api/types.gen';

type ItemsListPayload = NonNullable<ItemsListResponses[200]>;
type DistinctTypesPayload = NonNullable<ItemsDistinctTypesResponses[200]>;
type LocationsTreePayload = NonNullable<LocationsTreeResponses[200]>;
type SearchByAssetIdPayload = NonNullable<ItemsSearchByAssetIdResponses[200]>;

type SdkResult<T> =
  | { data: T; error: undefined }
  | { data: undefined; error: { message: string }; response: { status: number } };

function ok<T>(data: T): SdkResult<T> {
  return { data, error: undefined };
}

const mocks = vi.hoisted(() => ({
  itemsList: vi.fn(),
  itemsDistinctTypes: vi.fn(),
  locationsTree: vi.fn(),
  itemsSearchByAssetId: vi.fn(),
  itemsDelete: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  itemsList: (...args: unknown[]) => mocks.itemsList(...args),
  itemsDistinctTypes: (...args: unknown[]) => mocks.itemsDistinctTypes(...args),
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
  itemsSearchByAssetId: (...args: unknown[]) => mocks.itemsSearchByAssetId(...args),
  itemsDelete: (...args: unknown[]) => mocks.itemsDelete(...args),
}));

vi.mock('../components/InventoryTable', () => ({
  InventoryTable: () => <div data-testid="inventory-table" />,
}));

vi.mock('../components/InventoryCard', () => ({
  InventoryCard: () => <div data-testid="inventory-card" />,
}));

import { ItemsPage } from './ItemsPage';

const EMPTY_ITEMS_PAYLOAD: ItemsListPayload = {
  data: [],
  pagination: { hasMore: false, limit: 200, offset: 0, total: 0 },
  totals: { totalReplacementValue: 0, totalResaleValue: 0 },
};

function mockItemsList(payload: ItemsListPayload = EMPTY_ITEMS_PAYLOAD): void {
  mocks.itemsList.mockResolvedValue(ok(payload));
}

function mockDistinctTypes(types: string[]): void {
  mocks.itemsDistinctTypes.mockResolvedValue(ok({ data: types } satisfies DistinctTypesPayload));
}

function buildLocationNode(
  node: Pick<LocationTreeNode, 'id' | 'name'> & { children?: LocationTreeNode[] }
): LocationTreeNode {
  return {
    parentId: null,
    sortOrder: 0,
    children: [],
    ...node,
  };
}

function mockLocationsTree(nodes: LocationsTreePayload['data']): void {
  mocks.locationsTree.mockResolvedValue(ok({ data: nodes } satisfies LocationsTreePayload));
}

function mockSearchByAssetId(item: SearchByAssetIdPayload['data']): void {
  mocks.itemsSearchByAssetId.mockResolvedValue(ok({ data: item } satisfies SearchByAssetIdPayload));
}

/** Renders ItemsPage and a catch-all route so we can detect navigation. */
function renderWithProviders(initialPath = '/inventory'): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/inventory" element={<ItemsPage />} />
          <Route path="/inventory/warranties" element={<div data-testid="warranties-page" />} />
          <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
          <Route path="/inventory/items/new" element={<div data-testid="item-new-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItemsList();
    mockDistinctTypes([]);
    mockLocationsTree([]);
  });

  // Defensive: ensure no fake-timer test can leak frozen timers into the next
  // test (a timed-out fake-timer test never runs its own restore).
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Filters', () => {
    it('renders Type select dropdown with dynamic options from database', async () => {
      mockDistinctTypes(['Electronics', 'Furniture', 'Appliances']);
      renderWithProviders();

      // Options resolve async via react-query: "All Types" + 3 dynamic types = 4
      await waitFor(() => {
        const typeSelect = screen.getAllByRole('combobox')[0]!;
        expect(typeSelect.querySelectorAll('option').length).toBe(4);
      });
    });

    it('renders Location select dropdown with hierarchical options', async () => {
      mockLocationsTree([
        buildLocationNode({
          id: 'loc-1',
          name: 'Home',
          children: [buildLocationNode({ id: 'loc-2', name: 'Office' })],
        }),
      ]);
      renderWithProviders();

      // Location select should have: All Locations, Home, └ Office
      await waitFor(() => {
        const locationSelect = screen.getAllByRole('combobox').at(-1)!;
        expect(locationSelect.querySelectorAll('option').length).toBeGreaterThanOrEqual(3);
      });
    });

    it('renders Condition select dropdown with all options', async () => {
      renderWithProviders();

      const selects = await screen.findAllByRole('combobox');
      // All Conditions + Excellent + New + Good + Fair + Poor + Broken = 7
      const conditionSelect = selects[1]!; // second select
      const options = conditionSelect.querySelectorAll('option');
      expect(options.length).toBe(7);
      const values = Array.from(options).map((o) => o.getAttribute('value'));
      expect(values).toEqual(['', 'Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken']);
    });

    it('shows Clear filters button when a filter is active', async () => {
      renderWithProviders('/inventory?type=Electronics');

      expect(await screen.findByText('Clear filters')).toBeInTheDocument();
    });

    it('does not show Clear filters button when no filters are active', async () => {
      renderWithProviders();
      await screen.findAllByRole('combobox');
      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    });
  });

  describe('Query parameter persistence', () => {
    it('reads search query from URL params', () => {
      renderWithProviders('/inventory?q=MacBook');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      expect(searchInput).toHaveValue('MacBook');
    });

    it('reads type filter from URL params', async () => {
      mockDistinctTypes(['Electronics']);
      renderWithProviders('/inventory?type=Electronics');

      await waitFor(() => {
        expect(screen.getAllByRole('combobox')[0]).toHaveValue('Electronics');
      });
    });

    it('reads condition filter from URL params', () => {
      renderWithProviders('/inventory?condition=Good');

      const conditionSelect = screen.getAllByRole('combobox')[1];
      expect(conditionSelect).toHaveValue('Good');
    });

    it('reads Excellent condition filter from URL params', () => {
      renderWithProviders('/inventory?condition=Excellent');

      const conditionSelect = screen.getAllByRole('combobox')[1];
      expect(conditionSelect).toHaveValue('Excellent');
    });

    it('debounces the search query — API receives the term only after 300ms', async () => {
      // shouldAdvanceTime lets `waitFor`'s real-timer polling progress while we
      // still drive the debounce manually with advanceTimersByTime — otherwise
      // waitFor deadlocks against frozen timers.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderWithProviders();

        const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');

        // Clear call history so we start from a clean slate after initial render.
        mocks.itemsList.mockClear();

        const hasSearchTermCall = () =>
          (mocks.itemsList.mock.calls as Array<[{ query?: { search?: string } }]>).some(
            ([input]) => input?.query?.search === 'MacBook'
          );

        fireEvent.change(searchInput, { target: { value: 'MacBook' } });

        // Immediately after typing, debounce has not fired — term must not appear.
        expect(hasSearchTermCall()).toBe(false);

        // Still before 300ms — term must still be absent.
        await act(async () => {
          vi.advanceTimersByTime(299);
        });
        expect(hasSearchTermCall()).toBe(false);

        // Exactly at 300ms the debounce fires — term must appear.
        await act(async () => {
          vi.advanceTimersByTime(1);
        });
        await waitFor(() => expect(hasSearchTermCall()).toBe(true));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Asset ID search', () => {
    it('navigates to item detail on Enter when asset ID matches', async () => {
      mockSearchByAssetId({
        assetId: 'ELEC-001',
        brand: null,
        condition: null,
        deductible: false,
        id: 'item-99',
        inUse: false,
        itemId: null,
        itemName: 'Test Item',
        lastEditedTime: '2026-06-16T00:00:00Z',
        location: null,
        locationId: null,
        model: null,
        notes: null,
        purchaseDate: null,
        purchasePrice: null,
        purchaseTransactionId: null,
        purchasedFromId: null,
        purchasedFromName: null,
        replacementValue: null,
        resaleValue: null,
        room: null,
        type: null,
        warrantyExpires: null,
      });

      renderWithProviders('/inventory?q=ELEC-001');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mocks.itemsSearchByAssetId).toHaveBeenCalledWith({
          query: { assetId: 'ELEC-001' },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('item-detail-page')).toBeInTheDocument();
      });
    });

    it('stays on list page when asset ID does not match', async () => {
      mockSearchByAssetId(null);

      renderWithProviders('/inventory?q=NONEXISTENT');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mocks.itemsSearchByAssetId).toHaveBeenCalledWith({
          query: { assetId: 'NONEXISTENT' },
        });
      });

      // Should still be on inventory page
      expect(screen.getByText('Inventory')).toBeInTheDocument();
    });

    it('does not search on Enter when search is empty', () => {
      renderWithProviders();

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      expect(mocks.itemsSearchByAssetId).not.toHaveBeenCalled();
    });
  });

  describe('Empty state', () => {
    it('shows empty state message and persistent Add Item button when no items exist', async () => {
      renderWithProviders();

      expect(await screen.findByText('No inventory items yet.')).toBeInTheDocument();
      expect(screen.getByText('Add Item')).toBeInTheDocument();
    });

    it('navigates to new item page when Add Item button is clicked', async () => {
      renderWithProviders();

      fireEvent.click(await screen.findByText('Add Item'));
      expect(screen.getByTestId('item-new-page')).toBeInTheDocument();
    });

    it('shows no-results state when filters match nothing', async () => {
      renderWithProviders('/inventory?type=NonexistentType');

      expect(await screen.findByText('No items match your filters.')).toBeInTheDocument();
    });
  });
});
