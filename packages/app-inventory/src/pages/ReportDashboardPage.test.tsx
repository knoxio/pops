import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dashboardQuery: vi.fn(),
  valueByTypeQuery: vi.fn(),
}));

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      reports: {
        dashboard: { useQuery: () => mocks.dashboardQuery() },
        valueByType: { useQuery: () => mocks.valueByTypeQuery() },
      },
    },
  },
}));

vi.mock('../components/ValueBreakdown', () => ({
  ValueByTypeCard: () => <div data-testid="value-by-type" />,
  ValueByLocationCard: () => <div data-testid="value-by-location" />,
}));

import { ReportDashboardPage } from './ReportDashboardPage';

function renderPage(initialPath = '/inventory/report') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/inventory/report" element={<ReportDashboardPage />} />
        <Route path="/inventory/warranties" element={<div data-testid="warranties-page" />} />
        <Route
          path="/inventory/report/insurance"
          element={<div data-testid="insurance-report-page" />}
        />
        <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
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
      itemCount: 12,
      totalReplacementValue: 9500,
      totalResaleValue: 4200,
      warrantiesExpiringSoon: 2,
      recentlyAdded: [
        {
          id: 'item-1',
          itemName: 'Laptop',
          type: 'Electronics',
          assetId: 'ELEC-001',
          lastEditedTime: new Date().toISOString(),
        },
      ],
    },
  },
};

describe('ReportDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.valueByTypeQuery.mockReturnValue({ data: null, isLoading: false });
  });

  it('renders page title', () => {
    mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
    renderPage();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders Insurance Report link button', () => {
    mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
    renderPage();
    expect(screen.getByText('Insurance Report')).toBeInTheDocument();
  });

  it('navigates to /inventory/report/insurance on Insurance Report click', () => {
    mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
    renderPage();
    fireEvent.click(screen.getByText('Insurance Report'));
    expect(screen.getByTestId('insurance-report-page')).toBeInTheDocument();
  });

  describe('DashboardWidgets — empty inventory', () => {
    it('shows item count of 0', () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it('shows No items yet in recently added section', () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();
      expect(screen.getByText('No items yet')).toBeInTheDocument();
    });

    it('shows $0 for replacement value', () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();
      const zeros = screen.getAllByText('$0');
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it('shows warranties expiring count of 0', () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();
      expect(screen.getByText('Warranties')).toBeInTheDocument();
      expect(screen.getByText('expiring')).toBeInTheDocument();
    });
  });

  describe('DashboardWidgets — populated inventory', () => {
    it('renders item count', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('renders warranties expiring count', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('expiring')).toBeInTheDocument();
    });

    it('renders recently added item names', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();
      expect(screen.getByText('Laptop')).toBeInTheDocument();
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

    it('navigates to item detail when recently added item is clicked', () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();
      fireEvent.click(screen.getByText('Laptop'));
      expect(screen.getByTestId('item-detail-page')).toBeInTheDocument();
    });
  });

  describe('DashboardWidgets — loading state', () => {
    it('renders loading skeletons and does not show widget labels', () => {
      mocks.dashboardQuery.mockReturnValue({ data: null, isLoading: true });
      renderPage();
      expect(screen.queryByText('Warranties')).not.toBeInTheDocument();
    });
  });
});
