import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchResultsPanel } from "./SearchResultsPanel";
import type { SearchResultSection } from "./SearchResultsPanel";
import { _clearRegistry, registerResultComponent } from "./result-component-registry";

beforeEach(() => {
  _clearRegistry();
});

function makeSection(overrides: Partial<SearchResultSection> = {}): SearchResultSection {
  return {
    domain: "movies",
    label: "Movies",
    icon: <span data-testid="icon">🎬</span>,
    color: "purple",
    hits: [
      {
        uri: "pops:media/movie/1",
        score: 0.8,
        matchField: "title",
        matchType: "prefix",
        data: { title: "The Matrix" },
      },
    ],
    isContext: false,
    ...overrides,
  };
}

describe("SearchResultsPanel", () => {
  it("renders sections with headers", () => {
    const sections = [makeSection()];
    render(<SearchResultsPanel sections={sections} query="matrix" onClose={vi.fn()} />);
    expect(screen.getByTestId("search-results-panel")).toBeInTheDocument();
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // count
  });

  it("renders no results state when all sections are empty", () => {
    render(
      <SearchResultsPanel sections={[makeSection({ hits: [] })]} query="xyz" onClose={vi.fn()} />
    );
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("hides empty sections", () => {
    const sections = [
      makeSection({ domain: "movies", label: "Movies", hits: [] }),
      makeSection({
        domain: "transactions",
        label: "Transactions",
        hits: [
          {
            uri: "pops:finance/tx/1",
            score: 0.5,
            matchField: "description",
            matchType: "contains",
            data: { description: "Coffee" },
          },
        ],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="coffee" onClose={vi.fn()} />);
    expect(screen.queryByTestId("section-movies")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-transactions")).toBeInTheDocument();
  });

  it("places context section first", () => {
    const sections = [
      makeSection({
        domain: "movies",
        label: "Movies",
        isContext: false,
        hits: [{ uri: "m/1", score: 1.0, matchField: "t", matchType: "exact", data: {} }],
      }),
      makeSection({
        domain: "transactions",
        label: "Transactions",
        isContext: true,
        hits: [{ uri: "t/1", score: 0.5, matchField: "d", matchType: "contains", data: {} }],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const sectionElements = screen.getAllByTestId(/^section-/);
    expect(sectionElements[0]).toHaveAttribute("data-testid", "section-transactions");
    expect(sectionElements[1]).toHaveAttribute("data-testid", "section-movies");
  });

  it("applies visual distinction to context section", () => {
    const sections = [makeSection({ isContext: true })];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const section = screen.getByTestId("section-movies");
    expect(section.className).toContain("border-l-primary");
    expect(section.className).toContain("bg-accent/30");
  });

  it("sorts non-context sections by highest score descending", () => {
    const sections = [
      makeSection({
        domain: "budgets",
        label: "Budgets",
        hits: [{ uri: "b/1", score: 0.5, matchField: "c", matchType: "contains", data: {} }],
      }),
      makeSection({
        domain: "movies",
        label: "Movies",
        hits: [{ uri: "m/1", score: 0.9, matchField: "t", matchType: "prefix", data: {} }],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const sectionElements = screen.getAllByTestId(/^section-/);
    expect(sectionElements[0]).toHaveAttribute("data-testid", "section-movies");
    expect(sectionElements[1]).toHaveAttribute("data-testid", "section-budgets");
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on outside click", () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on click inside panel", () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    const panel = screen.getByTestId("search-results-panel");
    fireEvent.mouseDown(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onResultClick when a result is clicked", () => {
    const onResultClick = vi.fn();
    render(
      <SearchResultsPanel
        sections={[makeSection()]}
        query="test"
        onClose={vi.fn()}
        onResultClick={onResultClick}
      />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onResultClick).toHaveBeenCalledWith("pops:media/movie/1");
  });

  it("uses registered ResultComponent for domain", () => {
    const CustomComponent = ({ data }: { data: Record<string, unknown> }) => (
      <span data-testid="custom">Custom: {String(data.title)}</span>
    );
    registerResultComponent("movies", CustomComponent);

    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={vi.fn()} />);
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    expect(screen.getByText("Custom: The Matrix")).toBeInTheDocument();
  });

  it("falls back to GenericResultComponent for unknown domain", () => {
    const sections = [
      makeSection({
        domain: "unknown-domain",
        label: "Unknown",
        hits: [
          {
            uri: "u/1",
            score: 0.5,
            matchField: "name",
            matchType: "contains",
            data: { name: "Fallback Item" },
          },
        ],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    expect(screen.getByText("Fallback Item")).toBeInTheDocument();
  });
});
