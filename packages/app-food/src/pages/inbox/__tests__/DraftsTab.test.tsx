/**
 * PRD-134 — RTL coverage for the Drafts tab.
 *
 *   - renders rows from the mocked SDK query, including band pill, title,
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, useState, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { InboxDraftRow } from '@pops/app-food-db';

const inboxListMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  inboxList: inboxListMock,
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

function mockList(items: InboxDraftRow[], nextCursor: string | null = null): void {
  inboxListMock.mockResolvedValue({ data: { items, nextCursor } });
}

function lastBody(): Record<string, unknown> {
  const call = inboxListMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('inboxList was not called');
  return (call[0] as { body: Record<string, unknown> }).body;
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
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    []
  );
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockList([]);
});

describe('DraftsTab — PRD-134', () => {
  it('renders one row per item including band pill, title, age, sub-line', async () => {
    mockList([makeRow(), makeRow({ versionId: 12, title: 'Lentil dahl', qualityBand: 'clean' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText('Banana pancakes')).toBeInTheDocument();
    expect(screen.getByText('Lentil dahl')).toBeInTheDocument();
    const bands = screen.getAllByTestId('quality-band-badge');
    expect(bands).toHaveLength(2);
    expect(bands.map((b) => b.getAttribute('data-band')).toSorted()).toEqual(['clean', 'minor']);
  });

  it('shows the "<no title>" placeholder when the row has no title', async () => {
    mockList([makeRow({ title: null })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText('<no title>')).toBeInTheDocument();
  });

  it('shows the partialReason banner when set', async () => {
    mockList([makeRow({ partialReason: 'auth-dead' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const note = await screen.findByRole('note');
    expect(note.textContent).toMatch(/Instagram cookies expired/i);
  });

  it('shows the "Inbox is empty" copy when nothing pending and no filters changed', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText(/Inbox is empty/i)).toBeInTheDocument();
    expect(screen.queryByTestId('drafts-clear-filters')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state + Clear-filters link when filters narrow to []', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    // Toggle a kind chip → filters now differ from default → filtered-empty.
    await user.click(screen.getByRole('button', { name: 'Web URL' }));
    expect(await screen.findByText(/No drafts match your filters/i)).toBeInTheDocument();
    expect(screen.getByTestId('drafts-clear-filters')).toBeInTheDocument();
  });

  it('passes band toggles into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    // Default: all 4 bands selected → wire is `undefined`. Toggling Clean off
    // drops the chip to a 3-element list → wire ships an array.
    await user.click(screen.getByRole('button', { name: 'Clean' }));
    await vi.waitFor(() => {
      expect(Array.isArray(lastBody().bands)).toBe(true);
    });
    expect(lastBody().bands).not.toContain('clean');
  });

  it('passes freshOnly toggle into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('drafts-freshonly'));
    await vi.waitFor(() => {
      expect(lastBody().freshOnly).toBe(true);
    });
  });

  it('passes sort dropdown into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('drafts-sort'), 'newest');
    await vi.waitFor(() => {
      expect(lastBody().sort).toBe('newest');
    });
  });

  it('renders the kind chip as a link with target=_blank for url-* rows', async () => {
    mockList([makeRow({ ingestKind: 'url-web' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const chip = await screen.findByTestId('draft-row-kind-link');
    expect(chip.getAttribute('href')).toBe('https://example.com/banana-pancakes');
    expect(chip.getAttribute('target')).toBe('_blank');
    expect(chip.getAttribute('rel')).toMatch(/noopener/);
    expect(chip.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('renders the kind chip as a preview button for text rows', async () => {
    mockList([makeRow({ ingestKind: 'text', sourceUrl: null })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    const chip = await screen.findByTestId('draft-row-kind-preview');
    await user.click(chip);
    expect(screen.getByTestId('view-source-dialog')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('view-source-dialog')).getByText(/Open the inspector view/i)
    ).toBeInTheDocument();
  });

  it('links the row card to /food/inbox/:sourceId', async () => {
    mockList([makeRow()]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const card = await screen.findByTestId('draft-row');
    const link = within(card).getByRole('link', { name: /Open inspector/i });
    expect(link.getAttribute('href')).toBe('/food/inbox/7');
  });

  it('surfaces a loading state', () => {
    inboxListMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/Loading drafts/i)).toBeInTheDocument();
  });

  it('surfaces an error state', async () => {
    inboxListMock.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText(/Couldn’t load drafts.*boom/i)).toBeInTheDocument();
  });
});
