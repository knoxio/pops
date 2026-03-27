import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockQuickPickQuery = vi.fn();
const mockRefetch = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      library: {
        quickPick: {
          useQuery: (...args: unknown[]) => {
            const result = mockQuickPickQuery(...args);
            return { ...result, refetch: mockRefetch };
          },
        },
      },
    },
    useUtils: () => ({}),
  },
}));

vi.mock("../components/MediaCard", () => ({
  MediaCard: ({ title, id }: { title: string; id: number }) => (
    <div data-testid={`media-card-${id}`}>{title}</div>
  ),
}));

import { QuickPickPage } from "./QuickPickPage";

const makeMovie = (id: number, title: string) => ({
  id,
  title,
  releaseDate: "2024-01-01",
  posterUrl: `/poster-${id}.jpg`,
  runtime: 120,
  voteAverage: 7.5,
  genres: ["Action"],
  overview: `Overview for ${title}`,
});

function renderPage(route = "/media/quick-pick") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QuickPickPage />
    </MemoryRouter>
  );
}

describe("QuickPickPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays the correct number of movies (default 3)", () => {
    mockQuickPickQuery.mockReturnValue({
      data: {
        data: [makeMovie(1, "Movie A"), makeMovie(2, "Movie B"), makeMovie(3, "Movie C")],
      },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByTestId("media-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("media-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("media-card-3")).toBeInTheDocument();
  });

  it("passes count from ?count= query param to the query", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "A"), makeMovie(2, "B")] },
      isLoading: false,
    });

    renderPage("/media/quick-pick?count=2");

    expect(mockQuickPickQuery).toHaveBeenCalledWith(
      { count: 2 },
      expect.anything()
    );
  });

  it("defaults invalid count param to 3", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "A"), makeMovie(2, "B"), makeMovie(3, "C")] },
      isLoading: false,
    });

    renderPage("/media/quick-pick?count=99");

    expect(mockQuickPickQuery).toHaveBeenCalledWith(
      { count: 3 },
      expect.anything()
    );
  });

  it("renders count selector with 2, 3, 4, 5 options", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "A")] },
      isLoading: false,
    });

    renderPage();

    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: String(n) })).toBeInTheDocument();
    }
  });

  it("highlights the active count option", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "A")] },
      isLoading: false,
    });

    renderPage("/media/quick-pick?count=4");

    const btn4 = screen.getByRole("button", { name: "4" });
    expect(btn4.getAttribute("aria-pressed")).toBe("true");
    const btn3 = screen.getByRole("button", { name: "3" });
    expect(btn3.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls refetch when 'Show me others' is clicked", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "A")] },
      isLoading: false,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /show me others/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("renders 'Watch This' button for each movie", () => {
    mockQuickPickQuery.mockReturnValue({
      data: {
        data: [makeMovie(1, "Movie A"), makeMovie(2, "Movie B")],
      },
      isLoading: false,
    });

    renderPage("/media/quick-pick?count=2");

    const watchButtons = screen.getAllByRole("button", { name: /watch this/i });
    expect(watchButtons).toHaveLength(2);
  });

  it("renders empty state when no unwatched movies", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("Nothing unwatched in your library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search for movies/i })).toBeInTheDocument();
  });

  it("renders partial fill when fewer movies than count", () => {
    mockQuickPickQuery.mockReturnValue({
      data: { data: [makeMovie(1, "Only One")] },
      isLoading: false,
    });

    renderPage("/media/quick-pick?count=5");

    expect(screen.getByTestId("media-card-1")).toBeInTheDocument();
    expect(screen.getByText("Only One")).toBeInTheDocument();
    const watchButtons = screen.getAllByRole("button", { name: /watch this/i });
    expect(watchButtons).toHaveLength(1);
  });

  it("shows loading skeletons", () => {
    mockQuickPickQuery.mockReturnValue({
      data: null,
      isLoading: true,
    });

    renderPage();

    expect(screen.queryByText("Quick Pick")).not.toBeInTheDocument();
  });
});
