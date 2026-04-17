import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakdownChart, type BreakdownEntry } from './ValueBreakdown';

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

const mockValueByTypeQuery = vi.fn();
const mockValueByLocationQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      reports: {
        valueByType: { useQuery: () => mockValueByTypeQuery() },
        valueByLocation: { useQuery: () => mockValueByLocationQuery() },
      },
    },
  },
}));

// Import after mocks
import { ValueByLocationCard, ValueByTypeCard } from './ValueBreakdown';

beforeEach(() => {
  vi.clearAllMocks();
  mockValueByTypeQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockValueByLocationQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('BreakdownChart', () => {
  it('shows empty message when no data', () => {
    renderWithRouter(<BreakdownChart data={[]} />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all entries have zero value', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 0, itemCount: 3 },
      { name: 'Furniture', totalValue: 0, itemCount: 2 },
    ];
    renderWithRouter(<BreakdownChart data={data} />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders bars when at least one entry has a positive value', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 5000, itemCount: 10 },
      { name: 'Furniture', totalValue: 0, itemCount: 5 },
    ];
    renderWithRouter(<BreakdownChart data={data} />);
    expect(screen.getByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('renders bars for each entry', () => {
    const data: BreakdownEntry[] = [
      { name: 'Electronics', totalValue: 5000, itemCount: 10 },
      { name: 'Furniture', totalValue: 3000, itemCount: 5 },
    ];
    renderWithRouter(<BreakdownChart data={data} />);
    expect(screen.getByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('calls onBarClick when bar is clicked', () => {
    const data: BreakdownEntry[] = [{ name: 'Electronics', totalValue: 5000, itemCount: 10 }];
    const onClick = vi.fn();
    renderWithRouter(<BreakdownChart data={data} onBarClick={onClick} />);
    fireEvent.click(screen.getByTestId('bar'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('ValueByTypeCard', () => {
  it('renders loading skeleton', () => {
    mockValueByTypeQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByTypeCard />);
    // Skeleton renders generic elements; check the card exists
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it("renders 'Value by Type' heading", () => {
    renderWithRouter(<ValueByTypeCard />);
    expect(screen.getByText('Value by Type')).toBeInTheDocument();
  });

  it('shows empty message when no types have values', () => {
    renderWithRouter(<ValueByTypeCard />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all types have zero value', () => {
    mockValueByTypeQuery.mockReturnValue({
      data: {
        data: [
          { name: 'Electronics', totalValue: 0, itemCount: 3 },
          { name: 'Furniture', totalValue: 0, itemCount: 2 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByTypeCard />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const refetch = vi.fn();
    mockValueByTypeQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch,
    });
    renderWithRouter(<ValueByTypeCard />);
    expect(screen.getByText('Failed to load type breakdown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders type entries', () => {
    mockValueByTypeQuery.mockReturnValue({
      data: {
        data: [
          { name: 'Electronics', totalValue: 5000, itemCount: 10 },
          { name: 'Furniture', totalValue: 3000, itemCount: 5 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByTypeCard />);
    expect(screen.getByTestId('bar-Electronics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Furniture')).toBeInTheDocument();
  });

  it('navigates to filtered inventory on bar click', () => {
    mockValueByTypeQuery.mockReturnValue({
      data: {
        data: [{ name: 'Electronics', totalValue: 5000, itemCount: 10 }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByTypeCard />);
    fireEvent.click(screen.getByTestId('bar'));
    expect(mockNavigate).toHaveBeenCalledWith('/inventory?type=Electronics');
  });
});

describe('ValueByLocationCard', () => {
  it('renders loading skeleton', () => {
    mockValueByLocationQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByLocationCard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it("renders 'Value by Location' heading", () => {
    renderWithRouter(<ValueByLocationCard />);
    expect(screen.getByText('Value by Location')).toBeInTheDocument();
  });

  it('shows empty message when no locations have values', () => {
    renderWithRouter(<ValueByLocationCard />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('shows empty message when all locations have zero value', () => {
    mockValueByLocationQuery.mockReturnValue({
      data: {
        data: [
          { name: 'Living Room', totalValue: 0, itemCount: 3, key: 'loc-1' },
          { name: 'Bedroom', totalValue: 0, itemCount: 2, key: 'loc-2' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByLocationCard />);
    expect(screen.getByText('No items with replacement values')).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const refetch = vi.fn();
    mockValueByLocationQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch,
    });
    renderWithRouter(<ValueByLocationCard />);
    expect(screen.getByText('Failed to load location breakdown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders location entries', () => {
    mockValueByLocationQuery.mockReturnValue({
      data: {
        data: [
          { name: 'Living Room', totalValue: 5000, itemCount: 10, key: 'loc-1' },
          { name: 'Bedroom', totalValue: 3000, itemCount: 5, key: 'loc-2' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByLocationCard />);
    expect(screen.getByTestId('bar-Living Room')).toBeInTheDocument();
    expect(screen.getByTestId('bar-Bedroom')).toBeInTheDocument();
  });

  it('navigates to filtered inventory by locationId on bar click', () => {
    mockValueByLocationQuery.mockReturnValue({
      data: {
        data: [{ name: 'Living Room', totalValue: 5000, itemCount: 10, key: 'loc-1' }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithRouter(<ValueByLocationCard />);
    fireEvent.click(screen.getByTestId('bar'));
    expect(mockNavigate).toHaveBeenCalledWith('/inventory?locationId=loc-1');
  });
});
