import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscoverCard } from "./DiscoverCard";

vi.mock("./RequestMovieButton", () => ({
  RequestMovieButton: ({ tmdbId }: { tmdbId: number; title: string; variant?: string }) => (
    <button data-testid={`request-${tmdbId}`}>Request</button>
  ),
}));

const baseProps = {
  tmdbId: 42,
  title: "Test Movie",
  releaseDate: "2024-01-15",
  posterPath: null,
  posterUrl: null,
  voteAverage: 7.5,
  inLibrary: false,
};

describe("DiscoverCard — not in library", () => {
  it("shows Add to Library button when not in library", () => {
    render(<DiscoverCard {...baseProps} />);
    expect(screen.getByLabelText("Add to Library")).toBeTruthy();
  });

  it("shows Watchlist (unfilled) button when not on watchlist", () => {
    render(<DiscoverCard {...baseProps} onWatchlist={false} />);
    expect(screen.getByLabelText("Add to Watchlist")).toBeTruthy();
  });

  it("shows Mark as Watched button when not watched", () => {
    render(<DiscoverCard {...baseProps} isWatched={false} />);
    expect(screen.getByLabelText("Mark as Watched")).toBeTruthy();
  });

  it("shows no status badge when not in library and not watched", () => {
    render(<DiscoverCard {...baseProps} />);
    expect(screen.queryByText("Owned")).toBeNull();
    expect(screen.queryByText("Watched")).toBeNull();
  });

  it("calls onAddToLibrary with tmdbId when Add button clicked", () => {
    const onAdd = vi.fn();
    render(<DiscoverCard {...baseProps} onAddToLibrary={onAdd} />);
    fireEvent.click(screen.getByLabelText("Add to Library"));
    expect(onAdd).toHaveBeenCalledWith(42);
  });
});

describe("DiscoverCard — in library, not watched", () => {
  const inLibraryProps = { ...baseProps, inLibrary: true, isWatched: false };

  it("hides Add to Library button when in library", () => {
    render(<DiscoverCard {...inLibraryProps} />);
    expect(screen.queryByLabelText("Add to Library")).toBeNull();
  });

  it("shows Owned badge when in library and not watched", () => {
    render(<DiscoverCard {...inLibraryProps} />);
    expect(screen.getByText("Owned")).toBeTruthy();
  });

  it("shows Mark as Watched button when in library but not watched", () => {
    render(<DiscoverCard {...inLibraryProps} />);
    expect(screen.getByLabelText("Mark as Watched")).toBeTruthy();
  });

  it("calls onMarkWatched with tmdbId when Mark as Watched clicked", () => {
    const onMark = vi.fn();
    render(<DiscoverCard {...inLibraryProps} onMarkWatched={onMark} />);
    fireEvent.click(screen.getByLabelText("Mark as Watched"));
    expect(onMark).toHaveBeenCalledWith(42);
  });
});

describe("DiscoverCard — watched", () => {
  const watchedProps = { ...baseProps, inLibrary: true, isWatched: true };

  it("shows Watched badge instead of Owned when isWatched", () => {
    render(<DiscoverCard {...watchedProps} />);
    expect(screen.getByText("Watched")).toBeTruthy();
    expect(screen.queryByText("Owned")).toBeNull();
  });

  it("shows Rewatched button instead of Watched when isWatched", () => {
    render(<DiscoverCard {...watchedProps} />);
    expect(screen.getByLabelText("Mark as Rewatched")).toBeTruthy();
    expect(screen.queryByLabelText("Mark as Watched")).toBeNull();
  });

  it("calls onMarkRewatched with tmdbId when Rewatched button clicked", () => {
    const onRewatch = vi.fn();
    render(<DiscoverCard {...watchedProps} onMarkRewatched={onRewatch} />);
    fireEvent.click(screen.getByLabelText("Mark as Rewatched"));
    expect(onRewatch).toHaveBeenCalledWith(42);
  });

  it("hides Add to Library button when watched (already in library)", () => {
    render(<DiscoverCard {...watchedProps} />);
    expect(screen.queryByLabelText("Add to Library")).toBeNull();
  });
});

describe("DiscoverCard — watchlist states", () => {
  it("shows filled bookmark icon when onWatchlist=true", () => {
    render(<DiscoverCard {...baseProps} onWatchlist={true} />);
    expect(screen.getByLabelText("Remove from Watchlist")).toBeTruthy();
  });

  it("shows unfilled bookmark icon when onWatchlist=false", () => {
    render(<DiscoverCard {...baseProps} onWatchlist={false} />);
    expect(screen.getByLabelText("Add to Watchlist")).toBeTruthy();
  });

  it("calls onAddToWatchlist with tmdbId when bookmark clicked (not on watchlist)", () => {
    const onAdd = vi.fn();
    render(<DiscoverCard {...baseProps} onWatchlist={false} onAddToWatchlist={onAdd} />);
    fireEvent.click(screen.getByLabelText("Add to Watchlist"));
    expect(onAdd).toHaveBeenCalledWith(42);
  });

  it("calls onRemoveFromWatchlist with tmdbId when bookmark clicked (already on watchlist)", () => {
    const onRemove = vi.fn();
    render(<DiscoverCard {...baseProps} onWatchlist={true} onRemoveFromWatchlist={onRemove} />);
    fireEvent.click(screen.getByLabelText("Remove from Watchlist"));
    expect(onRemove).toHaveBeenCalledWith(42);
  });
});

describe("DiscoverCard — request button visibility", () => {
  it("shows Request button when not in library", () => {
    render(<DiscoverCard {...baseProps} inLibrary={false} />);
    expect(screen.getByTestId("request-42")).toBeTruthy();
  });

  it("hides Request button when in library", () => {
    render(<DiscoverCard {...baseProps} inLibrary={true} />);
    expect(screen.queryByTestId("request-42")).toBeNull();
  });
});

describe("DiscoverCard — dismiss action", () => {
  it("shows Dismiss button", () => {
    render(<DiscoverCard {...baseProps} />);
    expect(screen.getByLabelText("Not Interested")).toBeTruthy();
  });

  it("calls onNotInterested with tmdbId when Dismiss clicked", () => {
    const onDismiss = vi.fn();
    render(<DiscoverCard {...baseProps} onNotInterested={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Not Interested"));
    expect(onDismiss).toHaveBeenCalledWith(42);
  });
});

describe("DiscoverCard — match info", () => {
  it("shows match percentage when provided", () => {
    render(<DiscoverCard {...baseProps} matchPercentage={87} matchReason="Action, Sci-Fi" />);
    expect(screen.getByText("87% Match")).toBeTruthy();
    expect(screen.getByText(/Action, Sci-Fi/)).toBeTruthy();
  });

  it("hides match info when matchPercentage is 0", () => {
    render(<DiscoverCard {...baseProps} matchPercentage={0} />);
    expect(screen.queryByText(/Match/)).toBeNull();
  });
});

describe("DiscoverCard — poster and metadata", () => {
  it("shows TMDB rating badge when voteAverage > 0", () => {
    render(<DiscoverCard {...baseProps} voteAverage={8.1} />);
    expect(screen.getByText("8.1")).toBeTruthy();
  });

  it("hides rating badge when voteAverage is 0", () => {
    render(<DiscoverCard {...baseProps} voteAverage={0} />);
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("shows release year", () => {
    render(<DiscoverCard {...baseProps} releaseDate="2024-01-15" />);
    expect(screen.getByText("2024")).toBeTruthy();
  });
});
