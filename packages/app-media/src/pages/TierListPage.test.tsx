import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockDimensionsQuery = vi.fn();
const mockTierListQuery = vi.fn();
const mockRefetch = vi.fn();
const mockMutate = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      media: {
        comparisons: {
          getTierListMovies: { invalidate: vi.fn() },
        },
      },
    }),
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
        submitTierList: {
          useMutation: () => ({
            mutate: mockMutate,
            isPending: false,
            error: null,
          }),
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

  it("submit button is disabled when fewer than 2 movies placed", () => {
    setupPage();
    renderPage();

    const submitBtn = screen.getByRole("button", { name: /Submit Tier List/i });
    expect(submitBtn).toBeDisabled();
  });

  it("drag-drop: movie moves from pool to tier row", () => {
    setupPage();
    renderPage();

    const movieCard = screen.getByLabelText("The Matrix");
    const tierS = screen.getByLabelText("Tier S");

    const movieData = JSON.stringify(movies[0]);
    const dataTransfer = {
      getData: () => movieData,
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(movieCard, { dataTransfer });
    fireEvent.dragOver(tierS, { dataTransfer });
    fireEvent.drop(tierS, { dataTransfer });

    // Movie should now be in tier S, not in unranked pool
    expect(screen.getByText("Unranked (2)")).toBeTruthy();
  });

  it("drag-drop: movie moves between tiers (reposition)", () => {
    setupPage();
    renderPage();

    const movieData = JSON.stringify(movies[0]);
    const dataTransfer = {
      getData: () => movieData,
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    // Drop into tier S
    const tierS = screen.getByLabelText("Tier S");
    fireEvent.drop(tierS, { dataTransfer });

    // Now move from S to A
    const tierA = screen.getByLabelText("Tier A");
    fireEvent.drop(tierA, { dataTransfer });

    // Still only 1 movie placed (moved, not duplicated)
    expect(screen.getByText("Unranked (2)")).toBeTruthy();
  });

  it("drag-drop: movie removed from tier back to unranked pool", () => {
    setupPage();
    renderPage();

    const movieData = JSON.stringify(movies[0]);
    const dataTransfer = {
      getData: () => movieData,
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    // Place in tier S
    const tierS = screen.getByLabelText("Tier S");
    fireEvent.drop(tierS, { dataTransfer });
    expect(screen.getByText("Unranked (2)")).toBeTruthy();

    // Drop back to unranked pool
    const pool = screen.getByLabelText("Unranked movies");
    fireEvent.dragOver(pool, { dataTransfer });
    fireEvent.drop(pool, { dataTransfer });
    expect(screen.getByText("Unranked (3)")).toBeTruthy();
  });

  it("submit button enables when 2+ movies placed and calls mutate", () => {
    setupPage();
    renderPage();

    const dataTransfer1 = {
      getData: () => JSON.stringify(movies[0]),
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };
    const dataTransfer2 = {
      getData: () => JSON.stringify(movies[1]),
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    const tierS = screen.getByLabelText("Tier S");
    const tierA = screen.getByLabelText("Tier A");

    fireEvent.drop(tierS, { dataTransfer: dataTransfer1 });
    fireEvent.drop(tierA, { dataTransfer: dataTransfer2 });

    const submitBtn = screen.getByRole("button", { name: /Submit Tier List/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(mockMutate).toHaveBeenCalledWith({
      dimensionId: 1,
      placements: expect.arrayContaining([
        { movieId: 10, tier: "S" },
        { movieId: 20, tier: "A" },
      ]),
    });
  });
});
