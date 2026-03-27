import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PreferenceProfile } from "./PreferenceProfile";

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

function renderProfile(props: Parameters<typeof PreferenceProfile>[0]) {
  return render(
    <MemoryRouter>
      <PreferenceProfile {...props} />
    </MemoryRouter>
  );
}

const fullProfile = {
  genreDistribution: [
    { genre: "Action", watchCount: 15, percentage: 30 },
    { genre: "Comedy", watchCount: 10, percentage: 20 },
    { genre: "Drama", watchCount: 8, percentage: 16 },
  ],
  genreAffinities: [
    { genre: "Drama", avgScore: 1600, movieCount: 5, totalComparisons: 12 },
    { genre: "Action", avgScore: 1450, movieCount: 8, totalComparisons: 20 },
    { genre: "Comedy", avgScore: 1300, movieCount: 4, totalComparisons: 8 },
  ],
  dimensionWeights: [
    { dimensionId: 1, name: "Cinematography", comparisonCount: 25, avgScore: 1500 },
    { dimensionId: 2, name: "Entertainment", comparisonCount: 18, avgScore: 1400 },
  ],
  totalMoviesWatched: 50,
  totalComparisons: 40,
};

describe("PreferenceProfile", () => {
  it("renders genre distribution chart with correct data", () => {
    renderProfile({ data: fullProfile, isLoading: false });

    expect(screen.getByTestId("preference-profile")).toBeInTheDocument();
    expect(screen.getByText("Genre Distribution")).toBeInTheDocument();
    expect(screen.getByTestId("genre-distribution-chart")).toBeInTheDocument();
  });

  it("renders genre affinity ranked by average score", () => {
    renderProfile({ data: fullProfile, isLoading: false });

    expect(screen.getByText("Genre Affinity")).toBeInTheDocument();
    expect(screen.getByTestId("genre-affinity-list")).toBeInTheDocument();

    // Drama has highest avgScore (1600), should appear first
    const items = screen.getByTestId("genre-affinity-list").querySelectorAll(".flex.items-center.gap-3");
    expect(items[0]?.textContent).toContain("Drama");
    expect(items[1]?.textContent).toContain("Action");
    expect(items[2]?.textContent).toContain("Comedy");
  });

  it("renders dimension weights chart", () => {
    renderProfile({ data: fullProfile, isLoading: false });

    expect(screen.getByText("Dimension Weights")).toBeInTheDocument();
    expect(screen.getByTestId("dimension-weights-chart")).toBeInTheDocument();
  });

  it("shows CTA when no comparisons exist", () => {
    const noComparisons = {
      ...fullProfile,
      totalComparisons: 0,
      genreAffinities: [],
      dimensionWeights: [],
    };

    renderProfile({ data: noComparisons, isLoading: false });

    // Genre distribution should still show
    expect(screen.getByTestId("genre-distribution-chart")).toBeInTheDocument();

    // Affinity and dimension weights should show CTAs
    const ctas = screen.getAllByTestId("compare-cta");
    expect(ctas).toHaveLength(2);
    expect(screen.getAllByText("Compare movies to see your preferences")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /start comparing/i })).toHaveLength(2);
  });

  it("hides entire section when no library items", () => {
    const emptyLibrary = {
      ...fullProfile,
      totalMoviesWatched: 0,
    };

    renderProfile({ data: emptyLibrary, isLoading: false });

    expect(screen.queryByTestId("preference-profile")).not.toBeInTheDocument();
  });

  it("shows loading skeleton", () => {
    renderProfile({ data: undefined, isLoading: true });

    expect(screen.getByTestId("preference-profile-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("preference-profile")).not.toBeInTheDocument();
  });

  it("renders profile heading", () => {
    renderProfile({ data: fullProfile, isLoading: false });

    expect(screen.getByText("Your Preference Profile")).toBeInTheDocument();
  });
});
