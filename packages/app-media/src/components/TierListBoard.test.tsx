import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TierListBoard, type TierMovie } from "./TierListBoard";

const sampleMovies: TierMovie[] = [
  {
    mediaType: "movie",
    mediaId: 1,
    title: "The Matrix",
    posterUrl: null,
    score: 1600,
    comparisonCount: 5,
  },
  {
    mediaType: "movie",
    mediaId: 2,
    title: "Inception",
    posterUrl: null,
    score: 1500,
    comparisonCount: 3,
  },
  {
    mediaType: "movie",
    mediaId: 3,
    title: "Interstellar",
    posterUrl: null,
    score: 1400,
    comparisonCount: 8,
  },
  {
    mediaType: "movie",
    mediaId: 4,
    title: "The Prestige",
    posterUrl: null,
    score: 1300,
    comparisonCount: 2,
  },
];

describe("TierListBoard", () => {
  it("renders all 5 tier rows with labels", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("D")).toBeTruthy();
  });

  it("renders all movies in the unranked pool initially", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("Inception")).toBeTruthy();
    expect(screen.getByText("Interstellar")).toBeTruthy();
    expect(screen.getByText("The Prestige")).toBeTruthy();
    expect(screen.getByText("Unranked (4)")).toBeTruthy();
  });

  it("renders submit button disabled when no movies are placed", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    const submitBtn = screen.getByRole("button", { name: /submit tier list/i });
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("renders 'Drop movies here' placeholder in empty tier rows", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    const placeholders = screen.getAllByText("Drop movies here");
    expect(placeholders.length).toBe(5); // One per tier row
  });

  it("renders movie cards with data-testid attributes", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("movie-card-1")).toBeTruthy();
    expect(screen.getByTestId("movie-card-2")).toBeTruthy();
    expect(screen.getByTestId("movie-card-3")).toBeTruthy();
    expect(screen.getByTestId("movie-card-4")).toBeTruthy();
  });

  it("shows submit pending state", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} submitPending />);

    expect(screen.getByText(/submitting/i)).toBeTruthy();
  });

  it("renders with empty movie list", () => {
    render(<TierListBoard movies={[]} onSubmit={vi.fn()} />);

    expect(screen.getByText("Unranked (0)")).toBeTruthy();
    expect(screen.getByText("All movies placed!")).toBeTruthy();
    const submitBtn = screen.getByRole("button", { name: /submit tier list/i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });
});
