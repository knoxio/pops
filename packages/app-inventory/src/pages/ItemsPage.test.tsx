import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dashboardQuery: vi.fn(),
  itemsQuery: vi.fn(),
  typesQuery: vi.fn(),
  treeQuery: vi.fn(),
  searchByAssetId: vi.fn(),
  valueByTypeQuery: vi.fn(),
}));

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      reports: {
        dashboard: { useQuery: () => mocks.dashboardQuery() },
        valueByType: { useQuery: () => mocks.valueByTypeQuery() },
      },
      items: {
        list: { useQuery: () => mocks.itemsQuery() },
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

vi.mock('../components/ValueBreakdown', () => ({
  ValueByTypeCard: () => <div data-testid="value-by-type" />,
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

const emptyDashboard = {
  data: {
    data: {
      itemCount: 0,
      totalReplacementValue: 0,
      totalResaleValue: 0,
      warrantiesExpiringSoon: 0,
      recentlyAdded: [],
    },
  },
};

const populatedDashboard = {
  data: {
    data: {
      itemCount: 42,
      totalReplacementValue: 15000,
      totalResaleValue: 8000,
      warrantiesExpiringSoon: 3,
      recentlyAdded: [
        {
          id: 'item-1',
          itemName: 'MacBook Pro',
          type: 'Electronics',
          assetId: 'ELEC-001',
          lastEditedTime: new Date().toISOString(),
        },
        {
          id: 'item-2',
          itemName: 'Standing Desk',
          type: 'Furniture',
          assetId: null,
          lastEditedTime: new Date().toISOString(),
        },
      ],
    },
  },
};

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
    mocks.valueByTypeQuery.mockReturnValue({ data: null, isLoading: false });
  });

  describe('DashboardWidgets', () => {
    it('renders loading skeletons while data is loading', () => {
      mocks.dashboardQuery.mockReturnValue({ data: null, isLoading: true });
      renderPage();
      expect(screen.queryByText('Warranties')).not.toBeInTheDocument();
    });

    it('renders all widget values with populated data', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('expiring')).toBeInTheDocument();
      expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
      expect(screen.getByText('Standing Desk')).toBeInTheDocument();
    });

    it('renders empty state values when inventory is empty', () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();

      // Item count shows 0, warranties shows 0 with "expiring" label
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('No items yet')).toBeInTheDocument();
    });

    it('navigates to /inventory/warranties when warranty widget is clicked', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText('Warranties').closest("[role='button']");
      expect(warrantyCard).toBeInTheDocument();
      fireEvent.click(warrantyCard!);
      expect(screen.getByTestId('warranties-page')).toBeInTheDocument();
    });

    it('navigates to /inventory/warranties on Enter key', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText('Warranties').closest("[role='button']");
      fireEvent.keyDown(warrantyCard!, { key: 'Enter' });
      expect(screen.getByTestId('warranties-page')).toBeInTheDocument();
    });

    it('navigates to /inventory/warranties on Space key', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText('Warranties').closest("[role='button']");
      fireEvent.keyDown(warrantyCard!, { key: ' ' });
      expect(screen.getByTestId('warranties-page')).toBeInTheDocument();
    });

    it('navigates to item detail when recently added item is clicked', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      fireEvent.click(screen.getByText('MacBook Pro'));
      expect(screen.getByTestId('item-detail-page')).toBeInTheDocument();
    });

    it('does not render dashboard when search is active', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage('/inventory?q=test');
      expect(screen.queryByText('Warranties')).not.toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    beforeEach(() => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
    });

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
      const locationSelect = selects[selects.length - 1]!; // last select
      const options = locationSelect.querySelectorAll('option');
      expect(options.length).toBeGreaterThanOrEqual(3);
    });

    it('renders Condition select dropdown with all options', () => {
      renderPage();

      const selects = screen.getAllByRole('combobox');
      // Condition select: placeholder + All Conditions + Excellent + Good + Fair + Poor = 6
      const conditionSelect = selects[1]!; // second select
      const options = conditionSelect.querySelectorAll('option');
      expect(options.length).toBe(6);
    });

    it('shows Clear filters button when a filter is active', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage('/inventory?type=Electronics');

      expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });

    it('does not show Clear filters button when no filters are active', () => {
      renderPage();
      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    });
  });

  describe('Query parameter persistence', () => {
    beforeEach(() => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
    });

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
      renderPage('/inventory?condition=Good');

      const selects = screen.getAllByRole('combobox');
      const conditionSelect = selects[1];
      expect(conditionSelect).toHaveValue('Good');
    });
  });

  describe('Asset ID search', () => {
    beforeEach(() => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
    });

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
    beforeEach(() => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
    });

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
