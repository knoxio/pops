/**
 * RTL coverage for SolvePage — PRD-150.
 *
 * Asserts that:
 *   - header renders + count caption reflects the query data
 *   - cookable recipes render in the order the server returned
 *   - clean (subsNeeded=0) cards label "No subs needed"
 *   - one-sub recipes inline the breakdown
 *   - multi-sub recipes hide subs behind an expander
 *   - clicking "Cook this" navigates to /food/recipes/:slug
 *   - excludeSubs toggle flips the input to the query and the
 *     resulting empty state surfaces a "Clear filters" affordance
 *   - bare-pantry empty state surfaces the Open-fridge link
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const solverCanICookMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  solverCanICook: solverCanICookMock,
}));

import { SolvePage } from '../SolvePage.js';

interface SolveSubBreakdown {
  lineIndex: number;
  fromIngredientName: string;
  fromVariantName: string | null;
  candidateSubName: string;
  substitutionId: number;
}

interface SolveRecipeRow {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: string | null;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  lastCookedAt: string | null;
  subsNeeded: number;
  subs: SolveSubBreakdown[];
}

interface SolveResult {
  totalCandidates: number;
  cookableCount: number;
  recipes: SolveRecipeRow[];
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
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
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

function row(partial: Partial<SolveRecipeRow> & { recipeId: number }): SolveRecipeRow {
  return {
    recipeSlug: `recipe-${partial.recipeId}`,
    title: `Recipe ${partial.recipeId}`,
    recipeType: 'plate',
    heroImagePath: null,
    prepMinutes: 10,
    cookMinutes: 10,
    lastCookedAt: null,
    subsNeeded: 0,
    subs: [],
    ...partial,
  };
}

function resolveWith(result: SolveResult): void {
  solverCanICookMock.mockResolvedValue({ data: result });
}

function render150(): void {
  render(
    <Wrapper>
      <SolvePage />
    </Wrapper>
  );
}

describe('SolvePage — PRD-150', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and the loading state initially', () => {
    solverCanICookMock.mockReturnValue(new Promise(() => {}));
    render150();
    expect(screen.getByRole('heading', { name: 'What can I cook?' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Working out/i);
  });

  it('renders the count caption and a cookable card list', async () => {
    resolveWith({
      totalCandidates: 5,
      cookableCount: 2,
      recipes: [
        row({ recipeId: 1, title: 'Tomato Soup', subsNeeded: 0 }),
        row({
          recipeId: 2,
          title: 'Cookies',
          subsNeeded: 1,
          subs: [
            {
              lineIndex: 1,
              fromIngredientName: 'butter',
              fromVariantName: null,
              candidateSubName: 'coconut-oil (refined)',
              substitutionId: 42,
            },
          ],
        }),
      ],
    });
    render150();
    expect(await screen.findByText('2 of 5 recipes cookable')).toBeInTheDocument();
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent('Tomato Soup');
    expect(articles[0]).toHaveTextContent(/No subs needed/i);
    expect(articles[1]).toHaveTextContent('Cookies');
    expect(articles[1]).toHaveTextContent(/butter → coconut-oil/);
  });

  it('hides multi-sub breakdown behind a toggle', async () => {
    resolveWith({
      totalCandidates: 1,
      cookableCount: 1,
      recipes: [
        row({
          recipeId: 1,
          title: 'Carbonara',
          subsNeeded: 2,
          subs: [
            {
              lineIndex: 1,
              fromIngredientName: 'pancetta',
              fromVariantName: null,
              candidateSubName: 'bacon',
              substitutionId: 1,
            },
            {
              lineIndex: 2,
              fromIngredientName: 'pecorino',
              fromVariantName: null,
              candidateSubName: 'parmesan',
              substitutionId: 2,
            },
          ],
        }),
      ],
    });
    render150();
    expect(await screen.findByRole('button', { name: /show subs/i })).toBeInTheDocument();
    expect(screen.queryByText('bacon')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show subs/i }));
    expect(screen.getByText(/pancetta → bacon/)).toBeInTheDocument();
    expect(screen.getByText(/pecorino → parmesan/)).toBeInTheDocument();
  });

  it('navigates to /food/recipes/:slug when Cook this is clicked', async () => {
    resolveWith({
      totalCandidates: 1,
      cookableCount: 1,
      recipes: [row({ recipeId: 1, title: 'Tomato Soup', recipeSlug: 'tomato-soup' })],
    });
    render150();
    await screen.findByText('Tomato Soup');
    const cookLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/food/recipes/tomato-soup');
    expect(cookLink).toBeDefined();
  });

  it('threads excludeSubs into the query and shows Clear filters on empty result', async () => {
    resolveWith({ totalCandidates: 3, cookableCount: 0, recipes: [] });
    render150();
    await userEvent.click(screen.getByLabelText('No substitutions'));
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    expect(solverCanICookMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ excludeSubs: true }) })
    );
  });

  it('shows the Open fridge link on the bare-pantry empty state', async () => {
    resolveWith({ totalCandidates: 0, cookableCount: 0, recipes: [] });
    render150();
    expect(await screen.findByText(/Pantry’s bare/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open fridge/i });
    expect(link).toHaveAttribute('href', '/food/fridge');
  });
});
