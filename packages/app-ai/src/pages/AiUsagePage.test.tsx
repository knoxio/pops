import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockGetStatsQuery = vi.fn();
const mockGetHistoryQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    core: {
      aiUsage: {
        getStats: {
          useQuery: (...args: unknown[]) => mockGetStatsQuery(...args),
        },
        getHistory: {
          useQuery: (...args: unknown[]) => mockGetHistoryQuery(...args),
        },
      },
    },
  },
}));

vi.mock("recharts", () => {
  const OrigReact = require("react");
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart-container">{children}</div>
    ),
    BarChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="bar-chart">{children}</div>
    ),
    Bar: () => <div data-testid="bar" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

vi.mock("@pops/ui", () => ({
  DataTable: ({ data }: { data: unknown[] }) => (
    <table data-testid="data-table">
      <tbody>
        {data.map((_, i) => (
          <tr key={i}>
            <td>row</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
  SortableHeader: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  StatCard: ({ title, value }: { title: string; value: string }) => (
    <div data-testid={`stat-${title}`}>{value}</div>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} aria-label={props["aria-label"] as string | undefined}>
      {children}
    </button>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import { AiUsagePage } from "./AiUsagePage";

const mockStats = {
  totalCost: 1.2345,
  totalApiCalls: 150,
  totalCacheHits: 50,
  cacheHitRate: 0.25,
  avgCostPerCall: 0.00823,
  totalInputTokens: 50000,
  totalOutputTokens: 10000,
  last30Days: {
    cost: 0.5678,
    apiCalls: 60,
    cacheHits: 20,
  },
};

const mockHistory = {
  records: [
    {
      date: "2026-03-25",
      apiCalls: 50,
      cacheHits: 15,
      inputTokens: 20000,
      outputTokens: 4000,
      cost: 0.3,
    },
    {
      date: "2026-03-26",
      apiCalls: 60,
      cacheHits: 20,
      inputTokens: 25000,
      outputTokens: 5000,
      cost: 0.4,
    },
    {
      date: "2026-03-27",
      apiCalls: 40,
      cacheHits: 15,
      inputTokens: 15000,
      outputTokens: 3000,
      cost: 0.2,
    },
  ],
  summary: { totalCost: 0.9, totalApiCalls: 150, totalCacheHits: 50 },
};

function setupDefaults() {
  mockGetStatsQuery.mockReturnValue({
    data: mockStats,
    isLoading: false,
    error: null,
  });
  mockGetHistoryQuery.mockReturnValue({
    data: mockHistory,
    isLoading: false,
    error: null,
  });
}

describe("AiUsagePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stat cards with correct values", () => {
    setupDefaults();
    render(<AiUsagePage />);

    expect(screen.getByTestId("stat-Total Cost")).toHaveTextContent("$1.2345");
    expect(screen.getByTestId("stat-API Calls")).toHaveTextContent("150");
    expect(screen.getByTestId("stat-Cache Hit Rate")).toHaveTextContent("25.0%");
    expect(screen.getByTestId("stat-Avg Cost/Call")).toHaveTextContent("$0.00823");
  });

  it("renders the bar chart when history has records", () => {
    setupDefaults();
    render(<AiUsagePage />);

    expect(screen.getByTestId("chart-container")).toBeTruthy();
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
  });

  it("renders the data table with history records", () => {
    setupDefaults();
    render(<AiUsagePage />);

    expect(screen.getByTestId("data-table")).toBeTruthy();
  });

  it("shows date filter inputs", () => {
    setupDefaults();
    render(<AiUsagePage />);

    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
  });

  it("passes date filter values to getHistory query", () => {
    setupDefaults();
    render(<AiUsagePage />);

    const fromInput = screen.getByLabelText("From");
    fireEvent.change(fromInput, { target: { value: "2026-03-01" } });

    expect(mockGetHistoryQuery).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-03-01" })
    );
  });

  it("shows clear button when date filter is active and clears on click", () => {
    setupDefaults();
    render(<AiUsagePage />);

    // No clear button initially
    expect(screen.queryByLabelText("Clear date filter")).toBeNull();

    // Set a date
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });

    // Clear button appears
    const clearBtn = screen.getByLabelText("Clear date filter");
    expect(clearBtn).toBeTruthy();

    // Click clear
    fireEvent.click(clearBtn);

    // Query should be called with undefined dates
    const lastCall = mockGetHistoryQuery.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("shows loading skeletons when data is loading", () => {
    mockGetStatsQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockGetHistoryQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<AiUsagePage />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("shows error state when stats query fails", () => {
    mockGetStatsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "Server error" },
    });
    mockGetHistoryQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<AiUsagePage />);

    expect(screen.getByText("Failed to load AI usage data")).toBeTruthy();
    expect(screen.getByText("Server error")).toBeTruthy();
  });

  it("shows empty state when no history records", () => {
    mockGetStatsQuery.mockReturnValue({ data: mockStats, isLoading: false, error: null });
    mockGetHistoryQuery.mockReturnValue({
      data: { records: [], summary: { totalCost: 0, totalApiCalls: 0, totalCacheHits: 0 } },
      isLoading: false,
      error: null,
    });
    render(<AiUsagePage />);

    expect(screen.getByText("No AI usage data yet")).toBeTruthy();
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("displays history summary text", () => {
    setupDefaults();
    render(<AiUsagePage />);

    expect(screen.getByText(/Showing 3 days/)).toBeTruthy();
    expect(screen.getByText(/0\.9000/)).toBeTruthy();
  });
});
