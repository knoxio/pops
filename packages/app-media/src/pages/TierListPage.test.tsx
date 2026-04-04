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

/** Simulate a drag-and-drop from one element to a drop zone. */
function simulateDragDrop(source: HTMLElement, target: HTMLElement, data: unknown) {
  const json = JSON.stringify(data);
  const dataTransfer = {
    setData: vi.fn(),
    getData: vi.fn(() => json),
    effectAllowed: "move",
    dropEffect: "move",
  };

  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
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

  it("renders 5 tier rows (S/A/B/C/D)", () => {
    setupPage();
    renderPage();

    for (const tier of ["S", "A", "B", "C", "D"]) {
      expect(screen.getByLabelText(`Tier ${tier}`)).toBeTruthy();
    }
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

    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 1 }, expect.any(Object));

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);

    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 2 }, expect.any(Object));
  });

  it("refresh button calls refetch and resets placements", () => {
    setupPage();
    renderPage();

    fireEvent.click(screen.getByLabelText("Refresh movie pool"));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it("submit button is disabled when fewer than 2 movies placed", () => {
    setupPage();
    renderPage();

    const submitBtn = screen.getByLabelText("Submit tier list");
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("drag-drop moves movie from unranked to tier row", () => {
    setupPage();
    renderPage();

    const matrixCard = screen.getByLabelText("The Matrix");
    const tierS = screen.getByLabelText("Tier S");

    simulateDragDrop(matrixCard, tierS, movies[0]);

    // Unranked count should decrease
    expect(screen.getByText("Unranked (2)")).toBeTruthy();
  });

  it("drag-drop two movies enables submit button", () => {
    setupPage();
    renderPage();

    // Drop two movies into tiers
    const matrixCard = screen.getByLabelText("The Matrix");
    const tierS = screen.getByLabelText("Tier S");
    simulateDragDrop(matrixCard, tierS, movies[0]);

    const inceptionCard = screen.getByLabelText("Inception");
    const tierA = screen.getByLabelText("Tier A");
    simulateDragDrop(inceptionCard, tierA, movies[1]);

    const submitBtn = screen.getByLabelText("Submit tier list");
    expect(submitBtn.hasAttribute("disabled")).toBe(false);
  });

  it("drag from tier back to unranked removes from tier", () => {
    setupPage();
    renderPage();

    // First drop into tier S
    const matrixCard = screen.getByLabelText("The Matrix");
    const tierS = screen.getByLabelText("Tier S");
    simulateDragDrop(matrixCard, tierS, movies[0]);
    expect(screen.getByText("Unranked (2)")).toBeTruthy();

    // Now drag back to unranked
    const unrankedPool = screen.getByLabelText("Unranked movies");
    simulateDragDrop(matrixCard, unrankedPool, movies[0]);
    expect(screen.getByText("Unranked (3)")).toBeTruthy();
  });

  it("drag between tiers repositions movie", () => {
    setupPage();
    renderPage();

    // Drop into tier S
    const matrixCard = screen.getByLabelText("The Matrix");
    const tierS = screen.getByLabelText("Tier S");
    simulateDragDrop(matrixCard, tierS, movies[0]);

    // Now move to tier B
    const tierB = screen.getByLabelText("Tier B");
    simulateDragDrop(matrixCard, tierB, movies[0]);

    // Should still show 2 unranked (only one movie was placed)
    expect(screen.getByText("Unranked (2)")).toBeTruthy();
    // Submit should still be disabled (only 1 placed)
    expect(screen.getByLabelText("Submit tier list").hasAttribute("disabled")).toBe(true);
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
