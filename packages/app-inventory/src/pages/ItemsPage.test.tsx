import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itemsQuery: vi.fn(),
  typesQuery: vi.fn(),
  treeQuery: vi.fn(),
  searchByAssetId: vi.fn(),
}));

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      items: {
        list: { useQuery: (input: unknown) => mocks.itemsQuery(input) },
        distinctTypes: { useQuery: () => mocks.typesQuery() },
        searchByAssetId: { fetch: mocks.searchByAssetId },
      },
      locations: {
        tree: { useQuery: () => mocks.treeQuery() },
      },
    },
    useUtils: () => ({
      inventory: {
        items: { searchByAssetId: { fetch: mocks.searchByAssetId } },
      },
    }),
  },
}));

vi.mock('../components/InventoryTable', () => ({
  InventoryTable: () => <div data-testid="inventory-table" />,
}));

vi.mock('../components/InventoryCard', () => ({
  InventoryCard: () => <div data-testid="inventory-card" />,
}));

import { ItemsPage } from './ItemsPage';

/** Renders ItemsPage and a catch-all route so we can detect navigation. */
function renderPage(initialPath = '/inventory') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/inventory" element={<ItemsPage />} />
        <Route path="/inventory/warranties" element={<div data-testid="warranties-page" />} />
        <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
        <Route path="/inventory/items/new" element={<div data-testid="item-new-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemsQuery.mockReturnValue({
      data: {
        data: [],
        pagination: { total: 0 },
        totals: { totalReplacementValue: 0, totalResaleValue: 0 },
      },
      isLoading: false,
    });
    mocks.typesQuery.mockReturnValue({ data: { data: [] } });
    mocks.treeQuery.mockReturnValue({ data: { data: [] } });
  });

  describe('Filters', () => {
    it('renders Type select dropdown with dynamic options from database', () => {
      mocks.typesQuery.mockReturnValue({
        data: { data: ['Electronics', 'Furniture', 'Appliances'] },
      });
      renderPage();

      const typeSelect = screen.getAllByRole('combobox')[0]!;
      expect(typeSelect).toBeInTheDocument();
      // Options include: placeholder + "All Types" + 3 dynamic types = 5
      const options = typeSelect.querySelectorAll('option');
      expect(options.length).toBe(5);
    });

    it('renders Location select dropdown with hierarchical options', () => {
      mocks.treeQuery.mockReturnValue({
        data: {
          data: [
            {
              id: 'loc-1',
              name: 'Home',
              children: [{ id: 'loc-2', name: 'Office', children: [] }],
            },
          ],
        },
      });
      renderPage();

      // Location select should have: All Locations, Home, └ Office
      const selects = screen.getAllByRole('combobox');
      const locationSelect = selects.at(-1)!; // last select
      const options = locationSelect.querySelectorAll('option');
      expect(options.length).toBeGreaterThanOrEqual(3);
    });

    it('renders Condition select dropdown with all options', () => {
      renderPage();

      const selects = screen.getAllByRole('combobox');
      // Condition select: placeholder + All Conditions + New + Good + Fair + Poor + Broken = 7
      const conditionSelect = selects[1]!; // second select
      const options = conditionSelect.querySelectorAll('option');
      expect(options.length).toBe(7);
    });

    it('shows Clear filters button when a filter is active', () => {
      renderPage('/inventory?type=Electronics');

      expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });

    it('does not show Clear filters button when no filters are active', () => {
      renderPage();
      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    });
  });

  describe('Query parameter persistence', () => {
    it('reads search query from URL params', () => {
      renderPage('/inventory?q=MacBook');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      expect(searchInput).toHaveValue('MacBook');
    });

    it('reads type filter from URL params', () => {
      mocks.typesQuery.mockReturnValue({ data: { data: ['Electronics'] } });
      renderPage('/inventory?type=Electronics');

      const typeSelect = screen.getAllByRole('combobox')[0];
      expect(typeSelect).toHaveValue('Electronics');
    });

    it('reads condition filter from URL params', () => {
      renderPage('/inventory?condition=good');

      const selects = screen.getAllByRole('combobox');
      const conditionSelect = selects[1];
      expect(conditionSelect).toHaveValue('good');
    });

    it('debounces the search query — API receives the term only after 300ms', async () => {
      vi.useFakeTimers();
      try {
        renderPage();

        const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');

        // Clear call history so we start from a clean slate after initial render.
        mocks.itemsQuery.mockClear();

        const hasSearchTermCall = () =>
          (mocks.itemsQuery.mock.calls as Array<[{ search?: string }]>).some(
            ([input]) => input?.search === 'MacBook'
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
        expect(hasSearchTermCall()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Asset ID search', () => {
    it('navigates to item detail on Enter when asset ID matches', async () => {
      mocks.searchByAssetId.mockResolvedValue({
        data: { id: 'item-99', itemName: 'Test Item' },
      });

      renderPage('/inventory?q=ELEC-001');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mocks.searchByAssetId).toHaveBeenCalledWith({ assetId: 'ELEC-001' });
      });

      await waitFor(() => {
        expect(screen.getByTestId('item-detail-page')).toBeInTheDocument();
      });
    });

    it('stays on list page when asset ID does not match', async () => {
      mocks.searchByAssetId.mockResolvedValue({ data: null });

      renderPage('/inventory?q=NONEXISTENT');

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mocks.searchByAssetId).toHaveBeenCalledWith({ assetId: 'NONEXISTENT' });
      });

      // Should still be on inventory page
      expect(screen.getByText('Inventory')).toBeInTheDocument();
    });

    it('does not search on Enter when search is empty', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      expect(mocks.searchByAssetId).not.toHaveBeenCalled();
    });
  });

  describe('Empty state', () => {
    it('shows empty state with Add button when no items exist', () => {
      renderPage();

      expect(screen.getByText('No inventory items yet.')).toBeInTheDocument();
      expect(screen.getByText('Add your first item')).toBeInTheDocument();
    });

    it('navigates to new item page when Add button is clicked', () => {
      renderPage();

      fireEvent.click(screen.getByText('Add your first item'));
      expect(screen.getByTestId('item-new-page')).toBeInTheDocument();
    });

    it('shows no-results state when filters match nothing', () => {
      renderPage('/inventory?type=NonexistentType');

      expect(screen.getByText('No items match your filters.')).toBeInTheDocument();
    });
  });
});
