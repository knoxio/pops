import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _clearRegistry, registerResultComponent } from './result-component-registry';
import { SearchResultsPanel } from './SearchResultsPanel';

import type { SearchResultSection } from './SearchResultsPanel';

beforeEach(() => {
  _clearRegistry();
});

function makeSection(overrides: Partial<SearchResultSection> = {}): SearchResultSection {
  const hits = overrides.hits ?? [
    {
      uri: 'pops:media/movie/1',
      score: 0.8,
      matchField: 'title',
      matchType: 'prefix',
      data: { title: 'The Matrix' },
    },
  ];
  return {
    domain: 'movies',
    label: 'Movies',
    icon: <span data-testid="icon">🎬</span>,
    color: 'purple',
    hits,
    totalCount: overrides.totalCount ?? hits.length,
    isContext: false,
    ...overrides,
  };
}

describe('SearchResultsPanel', () => {
  it('renders sections with headers showing total count', () => {
    const sections = [makeSection({ totalCount: 12 })];
    render(<SearchResultsPanel sections={sections} query="matrix" onClose={vi.fn()} />);
    expect(screen.getByTestId('search-results-panel')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // totalCount
  });

  it('renders no results state when all sections are empty', () => {
    render(
      <SearchResultsPanel sections={[makeSection({ hits: [] })]} query="xyz" onClose={vi.fn()} />
    );
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('hides empty sections', () => {
    const sections = [
      makeSection({ domain: 'movies', label: 'Movies', hits: [] }),
      makeSection({
        domain: 'transactions',
        label: 'Transactions',
        hits: [
          {
            uri: 'pops:finance/tx/1',
            score: 0.5,
            matchField: 'description',
            matchType: 'contains',
            data: { description: 'Coffee' },
          },
        ],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="coffee" onClose={vi.fn()} />);
    expect(screen.queryByTestId('section-movies')).not.toBeInTheDocument();
    expect(screen.getByTestId('section-transactions')).toBeInTheDocument();
  });

  it('places context section first', () => {
    const sections = [
      makeSection({
        domain: 'movies',
        label: 'Movies',
        isContext: false,
        hits: [{ uri: 'm/1', score: 1.0, matchField: 't', matchType: 'exact', data: {} }],
      }),
      makeSection({
        domain: 'transactions',
        label: 'Transactions',
        isContext: true,
        hits: [{ uri: 't/1', score: 0.5, matchField: 'd', matchType: 'contains', data: {} }],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const sectionElements = screen.getAllByTestId(/^section-(?!header)/);
    expect(sectionElements[0]).toHaveAttribute('data-testid', 'section-transactions');
    expect(sectionElements[1]).toHaveAttribute('data-testid', 'section-movies');
  });

  it('applies visual distinction to context section', () => {
    const sections = [makeSection({ isContext: true })];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const section = screen.getByTestId('section-movies');
    expect(section.className).toContain('border-l-primary');
    expect(section.className).toContain('bg-accent/30');
  });

  it('sorts non-context sections by highest score descending', () => {
    const sections = [
      makeSection({
        domain: 'budgets',
        label: 'Budgets',
        hits: [{ uri: 'b/1', score: 0.5, matchField: 'c', matchType: 'contains', data: {} }],
      }),
      makeSection({
        domain: 'movies',
        label: 'Movies',
        hits: [{ uri: 'm/1', score: 0.9, matchField: 't', matchType: 'prefix', data: {} }],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const sectionElements = screen.getAllByTestId(/^section-(?!header)/);
    expect(sectionElements[0]).toHaveAttribute('data-testid', 'section-movies');
    expect(sectionElements[1]).toHaveAttribute('data-testid', 'section-budgets');
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on outside click', () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on click inside panel', () => {
    const onClose = vi.fn();
    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={onClose} />);
    const panel = screen.getByTestId('search-results-panel');
    fireEvent.mouseDown(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onResultClick when a result is clicked', () => {
    const onResultClick = vi.fn();
    render(
      <SearchResultsPanel
        sections={[makeSection()]}
        query="test"
        onClose={vi.fn()}
        onResultClick={onResultClick}
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onResultClick).toHaveBeenCalledWith('pops:media/movie/1');
  });

  it('uses registered ResultComponent for domain', () => {
    const CustomComponent = ({ data }: { data: Record<string, unknown> }) => (
      <span data-testid="custom">Custom: {String(data.title)}</span>
    );
    registerResultComponent('movies', CustomComponent);

    render(<SearchResultsPanel sections={[makeSection()]} query="test" onClose={vi.fn()} />);
    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(screen.getByText('Custom: The Matrix')).toBeInTheDocument();
  });

  it('falls back to GenericResultComponent for unknown domain', () => {
    const sections = [
      makeSection({
        domain: 'unknown-domain',
        label: 'Unknown',
        hits: [
          {
            uri: 'u/1',
            score: 0.5,
            matchField: 'name',
            matchType: 'contains',
            data: { name: 'Fallback Item' },
          },
        ],
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    expect(screen.getByText('Fallback Item')).toBeInTheDocument();
  });

  it("shows 'Show more' link when totalCount exceeds displayed hits", () => {
    const sections = [makeSection({ totalCount: 15 })];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    expect(screen.getByTestId('show-more-movies')).toBeInTheDocument();
    expect(screen.getByText('Show more (14 remaining)')).toBeInTheDocument();
  });

  it("hides 'Show more' link when totalCount equals hits length", () => {
    const sections = [makeSection({ totalCount: 1 })];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    expect(screen.queryByTestId('show-more-movies')).not.toBeInTheDocument();
  });

  it("calls onShowMore with domain when 'Show more' is clicked", () => {
    const onShowMore = vi.fn();
    const sections = [makeSection({ totalCount: 10 })];
    render(
      <SearchResultsPanel
        sections={sections}
        query="test"
        onClose={vi.fn()}
        onShowMore={onShowMore}
      />
    );
    fireEvent.click(screen.getByTestId('show-more-movies'));
    expect(onShowMore).toHaveBeenCalledWith('movies');
    expect(onShowMore).toHaveBeenCalledTimes(1);
  });

  it("does not show 'Show more' when totalCount is not provided (defaults to hits length)", () => {
    const sections = [makeSection()]; // totalCount defaults to hits.length
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    expect(screen.queryByTestId('show-more-movies')).not.toBeInTheDocument();
  });

  it('assigns sequential data-result-index to hit buttons', () => {
    const sections = [
      makeSection({
        domain: 'movies',
        hits: [
          { uri: 'm/1', score: 1.0, matchField: 'title', matchType: 'exact', data: {} },
          { uri: 'm/2', score: 0.8, matchField: 'title', matchType: 'prefix', data: {} },
        ],
        totalCount: 2,
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]!).toHaveAttribute('data-result-index', '0');
    expect(buttons[1]!).toHaveAttribute('data-result-index', '1');
  });

  it('assigns sequential data-result-index across multiple sections', () => {
    const sections = [
      makeSection({
        domain: 'movies',
        hits: [{ uri: 'm/1', score: 1.0, matchField: 'title', matchType: 'exact', data: {} }],
        totalCount: 1,
      }),
      makeSection({
        domain: 'transactions',
        label: 'Transactions',
        hits: [{ uri: 't/1', score: 0.8, matchField: 'desc', matchType: 'prefix', data: {} }],
        totalCount: 1,
      }),
    ];
    render(<SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]!).toHaveAttribute('data-result-index', '0');
    expect(buttons[1]!).toHaveAttribute('data-result-index', '1');
  });

  it('highlights the selected result by selectedIndex', () => {
    const sections = [
      makeSection({
        domain: 'movies',
        hits: [
          { uri: 'm/1', score: 1.0, matchField: 'title', matchType: 'exact', data: {} },
          { uri: 'm/2', score: 0.8, matchField: 'title', matchType: 'prefix', data: {} },
        ],
        totalCount: 2,
      }),
    ];
    render(
      <SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} selectedIndex={1} />
    );
    const [first, second] = screen.getAllByRole('button');
    // first is not selected — no standalone bg-accent (hover:bg-accent is always present)
    expect(first!.className).not.toContain(' bg-accent');
    // second is selected — standalone bg-accent is appended
    expect(second!.className).toContain(' bg-accent');
  });

  it('highlights first result when selectedIndex is 0', () => {
    const sections = [
      makeSection({
        domain: 'movies',
        hits: [
          { uri: 'm/1', score: 1.0, matchField: 'title', matchType: 'exact', data: {} },
          { uri: 'm/2', score: 0.8, matchField: 'title', matchType: 'prefix', data: {} },
        ],
        totalCount: 2,
      }),
    ];
    render(
      <SearchResultsPanel sections={sections} query="test" onClose={vi.fn()} selectedIndex={0} />
    );
    const [first, second] = screen.getAllByRole('button');
    expect(first!.className).toContain(' bg-accent');
    expect(second!.className).not.toContain(' bg-accent');
  });
});
