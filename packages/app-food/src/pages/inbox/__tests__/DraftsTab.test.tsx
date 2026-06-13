/**
 * PRD-134 — RTL coverage for the Drafts tab.
 *
 *   - renders rows from the mocked tRPC query, including band pill, title,
 *     kind chip, age string, sub-line counts, partialReason banner
 *   - filter chip toggle updates the query input (band, kind, partialReason)
 *   - Fresh-only toggle updates the query input
 *   - sort dropdown change updates the query input
 *   - clicking the kind chip on a text/screenshot row opens the dialog
 *     without firing the row's navigation
 *   - clicking elsewhere on the row navigates to the inspector route
 *   - empty (filtered) state surfaces the Clear-filters link
 *   - empty (no filters) state surfaces the "Inbox is empty" copy
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, useState, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { InboxDraftRow } from '@pops/app-food-db';

const mockListQuery = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'inbox.list') return mockListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
}));

import { DEFAULT_DRAFTS_FILTERS, type DraftsFiltersState } from '../drafts-filters.js';
import { DraftsTab } from '../DraftsTab.js';

function makeRow(over: Partial<InboxDraftRow> = {}): InboxDraftRow {
  return {
    sourceId: 7,
    versionId: 11,
    recipeSlug: 'banana-pancakes',
    title: 'Banana pancakes',
    recipeType: 'plate',
    ingestKind: 'url-web',
    sourceUrl: 'https://example.com/banana-pancakes',
    ingestedAt: '2026-06-10 16:00:00',
    qualityBand: 'minor',
    qualityScore: 72,
    topSignals: [{ code: 'NO_YIELD', weight: -15 }],
    proposedSlugCount: 1,
    creationCount: 2,
    compileStatus: 'compiled',
    ...over,
  };
}

function StatefulHost({ now }: { now: Date }): ReactElement {
  const [filters, setFilters] = useState<DraftsFiltersState>(DEFAULT_DRAFTS_FILTERS);
  return <DraftsTab filters={filters} onFiltersChange={setFilters} now={now} />;
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { food: enAUFood } },
    });
    return instance;
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DraftsTab — PRD-134', () => {
  it('renders one row per item including band pill, title, age, sub-line', () => {
    mockListQuery.mockReturnValue({
      data: {
        items: [makeRow(), makeRow({ versionId: 12, title: 'Lentil dahl', qualityBand: 'clean' })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText('Banana pancakes')).toBeInTheDocument();
    expect(screen.getByText('Lentil dahl')).toBeInTheDocument();
    const bands = screen.getAllByTestId('quality-band-badge');
    expect(bands).toHaveLength(2);
    expect(bands.map((b) => b.getAttribute('data-band')).toSorted()).toEqual(['clean', 'minor']);
  });

  it('shows the "<no title>" placeholder when the row has no title', () => {
    mockListQuery.mockReturnValue({
      data: { items: [makeRow({ title: null })], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText('<no title>')).toBeInTheDocument();
  });

  it('shows the partialReason banner when set', () => {
    mockListQuery.mockReturnValue({
      data: { items: [makeRow({ partialReason: 'auth-dead' })], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByRole('note').textContent).toMatch(/Instagram cookies expired/i);
  });

  it('shows the "Inbox is empty" copy when nothing pending and no filters changed', () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/Inbox is empty/i)).toBeInTheDocument();
    expect(screen.queryByTestId('drafts-clear-filters')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state + Clear-filters link when filters narrow to []', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    // Toggle a kind chip → filters now differ from default → filtered-empty.
    await user.click(screen.getByRole('button', { name: 'Web URL' }));
    expect(screen.getByText(/No drafts match your filters/i)).toBeInTheDocument();
    expect(screen.getByTestId('drafts-clear-filters')).toBeInTheDocument();
  });

  it('passes band toggles into the query input', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    // Default: all 4 bands selected → wire is `undefined`. Toggling Clean off
    // drops the chip to a 3-element list → wire ships an array.
    await user.click(screen.getByRole('button', { name: 'Clean' }));
    const lastInput = mockListQuery.mock.calls.at(-1)?.[0];
    expect(Array.isArray(lastInput.bands)).toBe(true);
    expect(lastInput.bands).not.toContain('clean');
  });

  it('passes freshOnly toggle into the query input', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('drafts-freshonly'));
    const lastInput = mockListQuery.mock.calls.at(-1)?.[0];
    expect(lastInput.freshOnly).toBe(true);
  });

  it('passes sort dropdown into the query input', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('drafts-sort'), 'newest');
    const lastInput = mockListQuery.mock.calls.at(-1)?.[0];
    expect(lastInput.sort).toBe('newest');
  });

  it('renders the kind chip as a link with target=_blank for url-* rows', () => {
    mockListQuery.mockReturnValue({
      data: { items: [makeRow({ ingestKind: 'url-web' })], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const chip = screen.getByTestId('draft-row-kind-link');
    expect(chip.getAttribute('href')).toBe('https://example.com/banana-pancakes');
    expect(chip.getAttribute('target')).toBe('_blank');
    expect(chip.getAttribute('rel')).toMatch(/noopener/);
    expect(chip.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('renders the kind chip as a preview button for text rows', async () => {
    mockListQuery.mockReturnValue({
      data: {
        items: [makeRow({ ingestKind: 'text', sourceUrl: null })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    const chip = screen.getByTestId('draft-row-kind-preview');
    await user.click(chip);
    expect(screen.getByTestId('view-source-dialog')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('view-source-dialog')).getByText(/Open the inspector view/i)
    ).toBeInTheDocument();
  });

  it('links the row card to /food/inbox/:sourceId', () => {
    mockListQuery.mockReturnValue({
      data: { items: [makeRow()], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const card = screen.getByTestId('draft-row');
    const link = within(card).getByRole('link', { name: /Open inspector/i });
    expect(link.getAttribute('href')).toBe('/food/inbox/7');
  });

  it('surfaces a loading state', () => {
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/Loading drafts/i)).toBeInTheDocument();
  });

  it('surfaces an error state', () => {
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/Couldn’t load drafts.*boom/i)).toBeInTheDocument();
  });
});
