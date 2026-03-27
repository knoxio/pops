import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const mockRankingsQuery = vi.fn();
const mockDimensionsQuery = vi.fn();
const mockMoviesQuery = vi.fn();
const mockTvShowsQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        rankings: { useQuery: (...args: unknown[]) => mockRankingsQuery(...args) },
        listDimensions: { useQuery: () => mockDimensionsQuery() },
      },
      movies: {
        list: { useQuery: (...args: unknown[]) => mockMoviesQuery(...args) },
      },
      tvShows: {
        list: { useQuery: (...args: unknown[]) => mockTvShowsQuery(...args) },
      },
    },
  },
}));

import { RankingsPage } from "./RankingsPage";

function renderPage(initialRoute = "/media/rankings") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <RankingsPage />
    </MemoryRouter>
  );
}

const movieA = { id: 1, title: "Alpha Movie", releaseDate: "2020-01-01", posterUrl: "/a.jpg" };
const movieB = { id: 2, title: "Beta Movie", releaseDate: "2021-06-15", posterUrl: "/b.jpg" };
const tvShow = { id: 10, name: "Gamma Show", firstAirDate: "2019-03-10", posterUrl: "/g.jpg" };

const rankedEntries = [
  { rank: 1, mediaType: "movie", mediaId: 1, score: 1532, comparisonCount: 5 },
  { rank: 2, mediaType: "movie", mediaId: 2, score: 1468, comparisonCount: 5 },
];

const dimensions = [
  {
    id: 1,
    name: "Story",
    active: true,
    sortOrder: 0,
    description: null,
    createdAt: "2026-01-01",
  },
  {
    id: 2,
    name: "Visuals",
    active: true,
    sortOrder: 1,
    description: null,
    createdAt: "2026-01-01",
  },
];

function setupDefaults() {
  mockDimensionsQuery.mockReturnValue({
    data: { data: dimensions },
    isLoading: false,
  });
  mockMoviesQuery.mockReturnValue({
    data: { data: [movieA, movieB] },
  });
  mockTvShowsQuery.mockReturnValue({
    data: { data: [tvShow] },
  });
  mockRankingsQuery.mockReturnValue({
    data: {
      data: rankedEntries,
      pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
    },
    isLoading: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

describe("RankingsPage", () => {
  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Rankings" })).toBeInTheDocument();
  });

  it("shows loading skeleton when dimensions are loading", () => {
    mockDimensionsQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.queryByRole("list", { name: "Rankings" })).not.toBeInTheDocument();
  });

  it("renders ranked items in order", () => {
    renderPage();
    const list = screen.getByRole("list", { name: "Rankings" });
    const items = within(list).getAllByText(/Movie/);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Alpha Movie")).toBeInTheDocument();
    expect(screen.getByText("Beta Movie")).toBeInTheDocument();
  });

  it("displays dimension tabs", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "Overall" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Story" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Visuals" })).toBeInTheDocument();
  });

  it("switches dimension on tab click", async () => {
    const user = userEvent.setup();
    renderPage();

    const storyTab = screen.getByRole("tab", { name: "Story" });
    await user.click(storyTab);

    // After clicking Story, the rankings query should have been called with dimensionId: 1
    expect(mockRankingsQuery).toHaveBeenCalledWith(expect.objectContaining({ dimensionId: 1 }));
  });

  it("shows empty state when no rankings", () => {
    mockRankingsQuery.mockReturnValue({
      data: {
        data: [],
        pagination: { total: 0, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText(/No rankings yet/)).toBeInTheDocument();
  });

  it("shows error alert on query failure", () => {
    mockRankingsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("fail"),
    });

    renderPage();
    expect(screen.getByText("Failed to load rankings.")).toBeInTheDocument();
  });

  it("renders score and match count", () => {
    renderPage();
    expect(screen.getByText("1532")).toBeInTheDocument();
    expect(screen.getAllByText("5 matches")).toHaveLength(2);
  });

  it("shows pagination when total exceeds page size", () => {
    const manyEntries = Array.from({ length: 25 }, (_, i) => ({
      rank: i + 1,
      mediaType: "movie",
      mediaId: i + 1,
      score: 1600 - i * 4,
      comparisonCount: 3,
    }));

    mockRankingsQuery.mockReturnValue({
      data: {
        data: manyEntries,
        pagination: { total: 30, limit: 25, offset: 0, hasMore: true },
      },
      isLoading: false,
      error: null,
    });
    mockMoviesQuery.mockReturnValue({
      data: {
        data: manyEntries.map((e) => ({
          id: e.mediaId,
          title: `Movie ${e.mediaId}`,
          releaseDate: "2020-01-01",
          posterUrl: null,
        })),
      },
    });

    renderPage();
    expect(screen.getByText(/Showing 1–25 of 30/)).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("hides tabs when no active dimensions", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });

    renderPage();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("selects Visuals tab when URL has ?dimension=2", () => {
    renderPage("/media/rankings?dimension=2");

    const visualsTab = screen.getByRole("tab", { name: "Visuals" });
    expect(visualsTab).toHaveAttribute("aria-selected", "true");

    const overallTab = screen.getByRole("tab", { name: "Overall" });
    expect(overallTab).toHaveAttribute("aria-selected", "false");
  });

  it("displays medal colors for top 3 ranks", () => {
    const top3 = [
      { rank: 1, mediaType: "movie", mediaId: 1, score: 1600, comparisonCount: 10 },
      { rank: 2, mediaType: "movie", mediaId: 2, score: 1550, comparisonCount: 10 },
      { rank: 3, mediaType: "movie", mediaId: 3, score: 1500, comparisonCount: 10 },
    ];

    mockRankingsQuery.mockReturnValue({
      data: {
        data: top3,
        pagination: { total: 3, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });
    mockMoviesQuery.mockReturnValue({
      data: {
        data: [
          { id: 1, title: "Gold", releaseDate: null, posterUrl: null },
          { id: 2, title: "Silver", releaseDate: null, posterUrl: null },
          { id: 3, title: "Bronze", releaseDate: null, posterUrl: null },
        ],
      },
    });

    renderPage();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("shows 'Unknown' for media without metadata", () => {
    mockMoviesQuery.mockReturnValue({ data: { data: [] } });
    mockTvShowsQuery.mockReturnValue({ data: { data: [] } });

    renderPage();
    const unknowns = screen.getAllByText("Unknown");
    expect(unknowns.length).toBeGreaterThanOrEqual(1);
  });
});
