import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakdownChart, type BreakdownEntry } from './ValueBreakdown';

import type {
  ReportsValueByLocationResponses,
  ReportsValueByTypeResponses,
} from '../inventory-api/types.gen';

// Mock recharts to avoid canvas rendering issues in jsdom
vi.mock('recharts', async () => {
  const React = await import('react');
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    BarChart: ({ children, data }: { children: React.ReactNode; data: BreakdownEntry[] }) =>
      React.createElement(
        'div',
        { 'data-testid': 'bar-chart' },
        data.map((entry: BreakdownEntry) =>
          React.createElement(
            'div',
            { key: entry.name, 'data-testid': `bar-${entry.name}` },
            entry.name
          )
        ),
        children
      ),
    Bar: ({
      onClick,
      children,
    }: {
      onClick?: (entry: Record<string, unknown>) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'bar',
          onClick: () =>
            onClick?.({ name: 'Electronics', key: 'loc-1', totalValue: 5000, itemCount: 10 }),
        },
        children
      ),
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Cell: () => null,
  };
});

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const reportsValueByTypeMock = vi.hoisted(() => vi.fn());
const reportsValueByLocationMock = vi.hoisted(() => vi.fn());

vi.mock('../inventory-api/index.js', () => ({
  reportsValueByType: (...args: unknown[]) => reportsValueByTypeMock(...args),
  reportsValueByLocation: (...args: unknown[]) => reportsValueByLocationMock(...args),
}));

// Import after mocks
import { ValueByLocationCard, ValueByTypeCard } from './ValueBreakdown';

type TypePayload = NonNullable<ReportsValueByTypeResponses[200]>;
type LocationPayload = NonNullable<ReportsValueByLocationResponses[200]>;

function mockTypeSuccess(data: TypePayload['data']): void {
  reportsValueByTypeMock.mockImplementation(async () => ({
    data: { data } satisfies TypePayload,
    error: undefined,
  }));
}

function mockLocationSuccess(data: LocationPayload['data']): void {
  reportsValueByLocationMock.mockImplementation(async () => ({
    data: { data } satisfies LocationPayload,
    error: undefined,
  }));
}

/**
 * A 404 surfaces the card's error UI (Alert + retry). 5xx / no-status are
 * "unavailable" and make the card render `null`, so they cannot be used here.
 */
function mockTypeError(message: string): void {
  reportsValueByTypeMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status: 404 },
  }));
}

function mockLocationError(message: string): void {
  reportsValueByLocationMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status: 404 },
  }));
}

function mockTypeNeverResolves(): void {
  reportsValueByTypeMock.mockImplementation(() => new Promise(() => undefined));
}

function mockLocationNeverResolves(): void {
  reportsValueByLocationMock.mockImplementation(() => new Promise(() => undefined));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTypeSuccess([]);
  mockLocationSuccess([]);
});

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BreakdownChart', () => {
  it('shows empty message when no data', () => {
    renderWithProviders(<BreakdownChart data={[]} />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all entries have zero value', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 0, itemCount: 3 },
      { name: 'Furniture', totalValue: 0, itemCount: 2 },
    ];
    renderWithProviders(<BreakdownChart data={data} />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders bars when at least one entry has a positive value', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 5000, itemCount: 10 },
      { name: 'Furniture', totalValue: 0, itemCount: 5 },
    ];
    renderWithProviders(<BreakdownChart data={data} />);
    expect(screen.getByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('renders bars for each entry', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 5000, itemCount: 10 },
      { name: 'Furniture', totalValue: 3000, itemCount: 5 },
    ];
    renderWithProviders(<BreakdownChart data={data} />);
    expect(screen.getByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('calls onBarClick when bar is clicked', () => {
    const data: BreakdownEntry[] = [{ name: 'Electronics', totalValue: 5000, itemCount: 10 }];
    const onClick = vi.fn();
    renderWithProviders(<BreakdownChart data={data} onBarClick={onClick} />);
    fireEvent.click(screen.getByTestId('bar'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('ValueByTypeCard', () => {
  it('renders loading skeleton', () => {
    mockTypeNeverResolves();
    renderWithProviders(<ValueByTypeCard />);
    // Skeleton renders generic elements; check the card exists
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it("renders 'Value by Type' heading", async () => {
    renderWithProviders(<ValueByTypeCard />);
    expect(await screen.findByText('Value by Type')).toBeInTheDocument();
  });

  it('shows empty message when no types have values', async () => {
    renderWithProviders(<ValueByTypeCard />);
    expect(await screen.findByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all types have zero value', async () => {
    mockTypeSuccess([
      { name: 'Electronics', totalValue: 0, itemCount: 3 },
      { name: 'Furniture', totalValue: 0, itemCount: 2 },
    ]);
    renderWithProviders(<ValueByTypeCard />);
    expect(await screen.findByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    mockTypeError('boom');
    renderWithProviders(<ValueByTypeCard />);
    expect(await screen.findByText('Failed to load type breakdown')).toBeInTheDocument();
    const callsBefore = reportsValueByTypeMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() =>
      expect(reportsValueByTypeMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it('renders type entries', async () => {
    mockTypeSuccess([
      { name: 'Electronics', totalValue: 5000, itemCount: 10 },
      { name: 'Furniture', totalValue: 3000, itemCount: 5 },
    ]);
    renderWithProviders(<ValueByTypeCard />);
    expect(await screen.findByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('navigates to filtered inventory on bar click', async () => {
    mockTypeSuccess([{ name: 'Electronics', totalValue: 5000, itemCount: 10 }]);
    renderWithProviders(<ValueByTypeCard />);
    fireEvent.click(await screen.findByTestId('bar'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/inventory?type=Electronics'));
  });
});

describe('ValueByLocationCard', () => {
  it('renders loading skeleton', () => {
    mockLocationNeverResolves();
    renderWithProviders(<ValueByLocationCard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it("renders 'Value by Location' heading", async () => {
    renderWithProviders(<ValueByLocationCard />);
    expect(await screen.findByText('Value by Location')).toBeInTheDocument();
  });

  it('shows empty message when no locations have values', async () => {
    renderWithProviders(<ValueByLocationCard />);
    expect(await screen.findByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all locations have zero value', async () => {
    mockLocationSuccess([
      { name: 'Living Room', totalValue: 0, itemCount: 3, key: 'loc-1' },
      { name: 'Bedroom', totalValue: 0, itemCount: 2, key: 'loc-2' },
    ]);
    renderWithProviders(<ValueByLocationCard />);
    expect(await screen.findByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    mockLocationError('boom');
    renderWithProviders(<ValueByLocationCard />);
    expect(await screen.findByText('Failed to load location breakdown')).toBeInTheDocument();
    const callsBefore = reportsValueByLocationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() =>
      expect(reportsValueByLocationMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it('renders location entries', async () => {
    mockLocationSuccess([
      { name: 'Living Room', totalValue: 5000, itemCount: 10, key: 'loc-1' },
      { name: 'Bedroom', totalValue: 3000, itemCount: 5, key: 'loc-2' },
    ]);
    renderWithProviders(<ValueByLocationCard />);
    expect(await screen.findByTestId('bar-Living Room')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Bedroom')).toBeInTheDocument();
  });

  it('navigates to filtered inventory by locationId on bar click', async () => {
    mockLocationSuccess([{ name: 'Living Room', totalValue: 5000, itemCount: 10, key: 'loc-1' }]);
    renderWithProviders(<ValueByLocationCard />);
    fireEvent.click(await screen.findByTestId('bar'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/inventory?locationId=loc-1'));
  });
});
