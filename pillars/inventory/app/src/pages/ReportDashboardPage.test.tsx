import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportsDashboardResponses } from '../inventory-api/types.gen';

const mocks = vi.hoisted(() => ({
  reportsDashboard: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  reportsDashboard: (...args: unknown[]) => mocks.reportsDashboard(...args),
}));

vi.mock('../components/ValueBreakdown', () => ({
  ValueByTypeCard: () => <div data-testid="value-by-type" />,
  ValueByLocationCard: () => <div data-testid="value-by-location" />,
}));

import { ReportDashboardPage } from './ReportDashboardPage';

type DashboardPayload = NonNullable<ReportsDashboardResponses[200]>;

function dashboardSuccess(summary: DashboardPayload['data']) {
  return { data: { data: summary } satisfies DashboardPayload, error: undefined };
}

function dashboardUnavailable(message = 'pillar unavailable') {
  return { data: undefined, error: { message }, response: { status: 500 } };
}

function mockDashboardSuccess(summary: DashboardPayload['data']): void {
  mocks.reportsDashboard.mockResolvedValue(dashboardSuccess(summary));
}

function mockDashboardUnavailable(): void {
  mocks.reportsDashboard.mockResolvedValue(dashboardUnavailable());
}

function mockDashboardPending(): void {
  mocks.reportsDashboard.mockReturnValue(new Promise(() => undefined));
}

function renderWithProviders(initialPath = '/inventory/reports') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/inventory/reports" element={<ReportDashboardPage />} />
          <Route path="/inventory/warranties" element={<div data-testid="warranties-page" />} />
          <Route
            path="/inventory/reports/insurance"
            element={<div data-testid="insurance-report-page" />}
          />
          <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const emptySummary: DashboardPayload['data'] = {
  itemCount: 0,
  totalReplacementValue: 0,
  totalResaleValue: 0,
  warrantiesExpiringSoon: 0,
  recentlyAdded: [],
};

const populatedSummary: DashboardPayload['data'] = {
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
};

describe('ReportDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', async () => {
    mockDashboardSuccess(populatedSummary);
    renderWithProviders();
    expect(await screen.findByText('Reports')).toBeInTheDocument();
  });

  it('renders Insurance Report link button', async () => {
    mockDashboardSuccess(populatedSummary);
    renderWithProviders();
    expect(await screen.findByText('Insurance Report')).toBeInTheDocument();
  });

  it('navigates to /inventory/reports/insurance on Insurance Report click', async () => {
    mockDashboardSuccess(populatedSummary);
    renderWithProviders();
    fireEvent.click(await screen.findByText('Insurance Report'));
    expect(screen.getByTestId('insurance-report-page')).toBeInTheDocument();
  });

  describe('DashboardWidgets — empty inventory', () => {
    it('shows item count of 0', async () => {
      mockDashboardSuccess(emptySummary);
      renderWithProviders();
      await waitFor(() => expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2));
    });

    it('shows No items yet in recently added section', async () => {
      mockDashboardSuccess(emptySummary);
      renderWithProviders();
      expect(await screen.findByText('No items yet')).toBeInTheDocument();
    });

    it('shows $0 for replacement value', async () => {
      mockDashboardSuccess(emptySummary);
      renderWithProviders();
      await waitFor(() => expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(2));
    });

    it('shows warranties expiring count of 0', async () => {
      mockDashboardSuccess(emptySummary);
      renderWithProviders();
      expect(await screen.findByText('Warranties')).toBeInTheDocument();
      expect(screen.getByText('expiring')).toBeInTheDocument();
    });
  });

  describe('DashboardWidgets — populated inventory', () => {
    it('renders item count', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      expect(await screen.findByText('12')).toBeInTheDocument();
    });

    it('renders warranties expiring count', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      expect(await screen.findByText('2')).toBeInTheDocument();
      expect(screen.getByText('expiring')).toBeInTheDocument();
    });

    it('renders recently added item names', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      expect(await screen.findByText('Laptop')).toBeInTheDocument();
    });

    it('navigates to /inventory/warranties when warranty widget is clicked', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      const warrantyCard = (await screen.findByText('Warranties')).closest("[role='button']");
      expect(warrantyCard).toBeInTheDocument();
      fireEvent.click(warrantyCard!);
      expect(screen.getByTestId('warranties-page')).toBeInTheDocument();
    });

    it('navigates to /inventory/warranties on Enter key', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      const warrantyCard = (await screen.findByText('Warranties')).closest("[role='button']");
      fireEvent.keyDown(warrantyCard!, { key: 'Enter' });
      expect(screen.getByTestId('warranties-page')).toBeInTheDocument();
    });

    it('navigates to item detail when recently added item is clicked', async () => {
      mockDashboardSuccess(populatedSummary);
      renderWithProviders();
      fireEvent.click(await screen.findByText('Laptop'));
      expect(screen.getByTestId('item-detail-page')).toBeInTheDocument();
    });
  });

  describe('DashboardWidgets — loading state', () => {
    it('renders loading skeletons and does not show widget labels', () => {
      mockDashboardPending();
      renderWithProviders();
      expect(screen.queryByText('Warranties')).not.toBeInTheDocument();
    });
  });

  describe('DashboardWidgets — unavailable', () => {
    it('renders nothing from the widgets when the dashboard query is unavailable', async () => {
      mockDashboardUnavailable();
      renderWithProviders();
      await waitFor(() => expect(mocks.reportsDashboard).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText('Warranties')).not.toBeInTheDocument());
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.getByText('Insurance Report')).toBeInTheDocument();
    });
  });
});
