import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TvShowSearchResult, highlightMatch } from "./TvShowSearchResult";
import { _clearRegistry, getResultComponent, registerResultComponent } from "@pops/navigation";

beforeEach(() => {
  _clearRegistry();
});

const baseTvShow = {
  name: "Breaking Bad",
  year: "2008",
  posterUrl: "/media/images/tv/81189/poster.jpg",
  status: "Ended",
  numberOfSeasons: 5,
  voteAverage: 9.5,
  _query: "breaking",
  _matchType: "prefix",
};

describe("TvShowSearchResult", () => {
  it("renders name, year, and season count", () => {
    render(<TvShowSearchResult data={baseTvShow as unknown as Record<string, unknown>} />);
    expect(screen.getByText(/Breaking/)).toBeInTheDocument();
    expect(screen.getByText("2008")).toBeInTheDocument();
    expect(screen.getByText("5 seasons")).toBeInTheDocument();
  });

  it("renders poster image", () => {
    render(<TvShowSearchResult data={baseTvShow as unknown as Record<string, unknown>} />);
    const img = screen.getByAltText("Breaking Bad poster");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/media/images/tv/81189/poster.jpg");
  });

  it("renders placeholder when no posterUrl", () => {
    const data = { ...baseTvShow, posterUrl: null };
    render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders singular 'season' for 1 season", () => {
    const data = { ...baseTvShow, numberOfSeasons: 1 };
    render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.getByText("1 season")).toBeInTheDocument();
  });

  it("hides season count when null", () => {
    const data = { ...baseTvShow, numberOfSeasons: null };
    render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByText(/season/)).not.toBeInTheDocument();
  });

  it("hides year when null", () => {
    const data = { ...baseTvShow, year: null };
    render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByText("2008")).not.toBeInTheDocument();
  });

  describe("status badge", () => {
    it("renders status badge for Ended", () => {
      render(<TvShowSearchResult data={baseTvShow as unknown as Record<string, unknown>} />);
      const badge = screen.getByTestId("status-badge");
      expect(badge).toHaveTextContent("Ended");
    });

    it("renders status badge for Continuing with blue style", () => {
      const data = { ...baseTvShow, status: "Continuing" };
      render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
      const badge = screen.getByTestId("status-badge");
      expect(badge).toHaveTextContent("Continuing");
      expect(badge.className).toContain("bg-blue-600");
    });

    it("renders Ended badge without blue style", () => {
      render(<TvShowSearchResult data={baseTvShow as unknown as Record<string, unknown>} />);
      const badge = screen.getByTestId("status-badge");
      expect(badge.className).not.toContain("bg-blue-600");
    });

    it("hides status badge when null", () => {
      const data = { ...baseTvShow, status: null };
      render(<TvShowSearchResult data={data as unknown as Record<string, unknown>} />);
      expect(screen.queryByTestId("status-badge")).not.toBeInTheDocument();
    });
  });

  describe("registration", () => {
    it("can be registered and retrieved for tv-shows domain", () => {
      registerResultComponent("tv-shows", TvShowSearchResult);
      const Component = getResultComponent("tv-shows");
      expect(Component).toBe(TvShowSearchResult);
    });
  });
});

describe("highlightMatch", () => {
  it("highlights exact match", () => {
    const { container } = render(<span>{highlightMatch("Severance", "Severance", "exact")}</span>);
    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("Severance");
  });

  it("highlights prefix match", () => {
    const { container } = render(
      <span>{highlightMatch("Breaking Bad", "Breaking", "prefix")}</span>
    );
    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("Breaking");
  });

  it("highlights contains match", () => {
    const { container } = render(<span>{highlightMatch("The Shogun", "Shogun", "contains")}</span>);
    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("Shogun");
  });

  it("returns plain text when query is empty", () => {
    const { container } = render(<span>{highlightMatch("Severance", "", "exact")}</span>);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Severance");
  });

  it("returns plain text when no match found", () => {
    const { container } = render(<span>{highlightMatch("Severance", "XYZ", "contains")}</span>);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Severance");
  });
});
