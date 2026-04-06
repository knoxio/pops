import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockDimensionsQuery = vi.fn();
const mockTierListQuery = vi.fn();
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
          useQuery: (...args: unknown[]) => mockTierListQuery(...args),
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

// TierListBoard uses @dnd-kit — mock it so drag events are not needed in page tests.
// Drag behavior is tested in TierListBoard.test.tsx.
vi.mock("../components/TierListBoard", () => ({
  TierListBoard: ({
    movies,
    onSubmit,
    submitPending,
  }: {
    movies: Array<{ mediaId: number; title: string }>;
    onSubmit: (placements: Array<{ movieId: number; tier: string }>) => void;
    submitPending: boolean;
  }) => (
    <div data-testid="tier-list-board">
      <span>Unranked ({movies.length})</span>
      {movies.map((m) => (
        <span key={m.mediaId}>{m.title}</span>
      ))}
      <button
        disabled={submitPending}
        onClick={() =>
          onSubmit([
            { movieId: movies[0]!.mediaId, tier: "S" },
            { movieId: movies[1]!.mediaId, tier: "A" },
          ])
        }
      >
        Submit Tier List
      </button>
    </div>
  ),
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

  it("renders movie cards in unranked pool via TierListBoard", () => {
    setupPage();
    renderPage();

    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("Inception")).toBeTruthy();
    expect(screen.getByText("Interstellar")).toBeTruthy();
  });

  it("displays unranked count from TierListBoard", () => {
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

    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 1 }, expect.any(Object));

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);

    expect(mockTierListQuery).toHaveBeenCalledWith({ dimensionId: 2 }, expect.any(Object));
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

  it("passes correct movies to TierListBoard with mediaId mapped from id", () => {
    setupPage();
    renderPage();

    // TierListBoard stub renders movie titles — verify all 3 appear
    expect(screen.getByTestId("tier-list-board")).toBeTruthy();
    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("Inception")).toBeTruthy();
    expect(screen.getByText("Interstellar")).toBeTruthy();
  });

  it("submit calls mutate with dimensionId and placements from TierListBoard", () => {
    setupPage();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /submit tier list/i }));

    expect(mockMutate).toHaveBeenCalledWith({
      dimensionId: 1,
      placements: [
        { movieId: 10, tier: "S" },
        { movieId: 20, tier: "A" },
      ],
    });
  });

  it("shows error alert when movie query fails", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockTierListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("fetch failed"),
    });

    renderPage();

    expect(screen.getByText("Failed to load movies for tier list.")).toBeTruthy();
  });
});
