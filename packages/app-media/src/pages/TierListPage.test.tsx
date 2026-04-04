import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockDimensionsQuery = vi.fn();
const mockTierListQuery = vi.fn();
const mockRefetch = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        listDimensions: {
          useQuery: (...args: unknown[]) => mockDimensionsQuery(...args),
        },
        getTierListMovies: {
          useQuery: (...args: unknown[]) => {
            const result = mockTierListQuery(...args);
            return { ...result, refetch: mockRefetch, isFetching: false };
          },
        },
      },
    },
  },
}));

import { TierListPage } from "./TierListPage";

const dim1 = { id: 1, name: "Cinematography", active: true, description: null, sortOrder: 0 };
const dim2 = { id: 2, name: "Entertainment", active: true, description: null, sortOrder: 1 };

const movies = [
  { id: 10, title: "The Matrix", posterUrl: null, score: 1500, comparisonCount: 5 },
  { id: 20, title: "Inception", posterUrl: null, score: 1480, comparisonCount: 3 },
  { id: 30, title: "Interstellar", posterUrl: null, score: 1520, comparisonCount: 8 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TierListPage />
    </MemoryRouter>
  );
}

function setupPage() {
  mockDimensionsQuery.mockReturnValue({
    data: { data: [dim1, dim2] },
    isLoading: false,
  });
  mockTierListQuery.mockReturnValue({
    data: { data: movies },
    isLoading: false,
    error: null,
  });
}

describe("TierListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dimension chips with first auto-selected", () => {
    setupPage();
    renderPage();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(2);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("renders movie cards in unranked pool", () => {
    setupPage();
    renderPage();

    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("Inception")).toBeTruthy();
    expect(screen.getByText("Interstellar")).toBeTruthy();
  });

  it("displays unranked count", () => {
    setupPage();
    renderPage();

    expect(screen.getByText("Unranked (3)")).toBeTruthy();
  });

  it("switching dimension changes selected chip", () => {
    setupPage();
    renderPage();

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);

    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
  });

  it("switching dimension reloads movies with new dimensionId", () => {
    setupPage();
    renderPage();

    // First call is for dim1 (auto-selected)
    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 1 }, expect.any(Object));

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);

    // After clicking dim2, should query with dimensionId: 2
    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 2 }, expect.any(Object));
  });

  it("refresh button calls refetch", () => {
    setupPage();
    renderPage();

    fireEvent.click(screen.getByLabelText("Refresh movie pool"));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state when no movies available", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockTierListQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText(/No eligible movies/)).toBeTruthy();
  });

  it("shows loading skeletons when data is loading", () => {
    mockDimensionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    mockTierListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderPage();

    expect(screen.queryByText("The Matrix")).toBeNull();
    expect(screen.queryByText("Tier List")).toBeTruthy();
  });
});
