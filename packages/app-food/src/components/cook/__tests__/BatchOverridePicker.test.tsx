/**
 * PRD-149 — RTL coverage for the picker's section split.
 *
 *  - Both sections render with the right counts.
 *  - Substitutions section shows the prep-mismatch chip when applicable.
 *  - Selecting a substitution row routes through `onSelect` with the
 *    `substitution` discriminant + the candidate + the batch.
 *  - "Show all" expander reveals candidates beyond the 5-row cap.
 *  - Loading / empty / error states render their respective copy.
 *
 * The picker drives `batchesSearchForConsume` + `substitutionsResolveForLine`
 * through React Query, so the generated SDK module is mocked and each render
 * is wrapped in a `QueryClientProvider`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { BatchForConsumeRow } from '../cook-resolution-types.js';

const sdk = vi.hoisted(() => ({
  batchesSearchForConsume: vi.fn(),
  substitutionsResolveForLine: vi.fn(),
}));

vi.mock('../../../food-api/index.js', () => sdk);

import { BatchOverridePicker } from '../BatchOverridePicker.js';

interface ResolutionShape {
  lineIndex: number;
  lineVariantId: number;
  lineVariantName: string;
  linePrepStateId: number | null;
  linePrepStateLabel: string | null;
  lineQty: number;
  lineUnit: 'g';
  recipeContextTags: readonly string[];
  candidates: readonly CandidateShape[];
}

interface CandidateShape {
  substitutionId: number;
  ratio: number;
  contextTags: readonly string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  substituteVariantId: number;
  substituteVariantName: string;
  substituteIngredientId: number;
  substituteIngredientName: string;
  notes: string | null;
  batches: readonly {
    batchId: number;
    qtyRemaining: number;
    unit: 'g';
    location: 'fridge';
    expiresAt: string | null;
    prepStateId: number | null;
    prepStateLabel: string | null;
  }[];
}

function makeBatch(over: Partial<BatchForConsumeRow> = {}): BatchForConsumeRow {
  return {
    id: 1,
    variantId: 100,
    variantName: 'diced',
    variantSlug: 'diced',
    ingredientId: 10,
    ingredientName: 'onion',
    prepStateId: null,
    prepStateLabel: null,
    qtyRemaining: 500,
    unit: 'g',
    location: 'fridge',
    expiresAt: null,
    producedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function makeCandidate(over: Partial<CandidateShape>): CandidateShape {
  return {
    substitutionId: 1,
    ratio: 1,
    contextTags: [],
    scope: 'global',
    recipeId: null,
    substituteVariantId: 200,
    substituteVariantName: 'whole',
    substituteIngredientId: 20,
    substituteIngredientName: 'shallot',
    notes: null,
    batches: [
      {
        batchId: 80,
        qtyRemaining: 200,
        unit: 'g',
        location: 'fridge',
        expiresAt: '2026-06-11',
        prepStateId: null,
        prepStateLabel: null,
      },
    ],
    ...over,
  };
}

function makeResolution(over: Partial<ResolutionShape> = {}): ResolutionShape {
  return {
    lineIndex: 1,
    lineVariantId: 100,
    lineVariantName: 'diced',
    linePrepStateId: null,
    linePrepStateLabel: null,
    lineQty: 100,
    lineUnit: 'g',
    recipeContextTags: [],
    candidates: [],
    ...over,
  };
}

function mockSearchItems(items: readonly BatchForConsumeRow[]) {
  sdk.batchesSearchForConsume.mockResolvedValue({ data: { items } });
}

function mockResolution(resolution: ResolutionShape) {
  sdk.substitutionsResolveForLine.mockResolvedValue({ data: resolution });
}

function renderPicker(
  overrides: Partial<Parameters<typeof BatchOverridePicker>[0]> = {}
): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactElement }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <BatchOverridePicker
      ingredientId={10}
      variantId={100}
      recipeVersionId={999}
      lineIndex={1}
      linePrepStateId={null}
      onSelect={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
    { wrapper: Wrapper }
  );
}

describe('BatchOverridePicker — PRD-149 sections', () => {
  it('renders Same-variant + Substitutions sections with their counts', async () => {
    mockSearchItems([makeBatch({ id: 18 }), makeBatch({ id: 19 })]);
    mockResolution(
      makeResolution({
        candidates: [
          makeCandidate({ substitutionId: 1 }),
          makeCandidate({ substitutionId: 2, substituteIngredientName: 'leek' }),
        ],
      })
    );

    renderPicker();

    const sameVariant = await screen.findByTestId('picker-section-same-variant');
    expect(await within(sameVariant).findByText(/Same variant \(2\)/i)).toBeInTheDocument();
    const subs = screen.getByTestId('picker-section-substitutions');
    expect(await within(subs).findByText(/Substitutions \(2\)/i)).toBeInTheDocument();
  });

  it('routes a substitution row click through onSelect with the candidate + batch', async () => {
    mockSearchItems([]);
    mockResolution(makeResolution({ candidates: [makeCandidate({ substitutionId: 7 })] }));
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderPicker({ variantId: undefined, onSelect });

    await user.click(await screen.findByTestId('sub-row-7-80'));

    expect(onSelect).toHaveBeenCalledWith({
      kind: 'substitution',
      candidate: expect.objectContaining({ substitutionId: 7 }),
      batch: expect.objectContaining({ batchId: 80 }),
    });
  });

  it('shows the prep-mismatch chip when the sub batch prep differs from the line', async () => {
    mockSearchItems([]);
    mockResolution(
      makeResolution({
        candidates: [
          makeCandidate({
            substitutionId: 9,
            batches: [
              {
                batchId: 50,
                qtyRemaining: 200,
                unit: 'g',
                location: 'fridge',
                expiresAt: null,
                prepStateId: 4,
                prepStateLabel: 'whole',
              },
            ],
          }),
        ],
      })
    );

    renderPicker({ variantId: undefined, linePrepStateId: 3 });

    expect(await screen.findByTestId('sub-row-9-prep-warning')).toBeInTheDocument();
  });

  it('reveals candidates beyond the 5-row cap via Show all', async () => {
    mockSearchItems([]);
    const candidates: CandidateShape[] = [];
    for (let i = 0; i < 7; i++) {
      candidates.push(
        makeCandidate({
          substitutionId: i + 100,
          substituteIngredientName: `sub-${i}`,
          batches: [
            {
              batchId: 1000 + i,
              qtyRemaining: 100,
              unit: 'g',
              location: 'fridge',
              expiresAt: null,
              prepStateId: null,
              prepStateLabel: null,
            },
          ],
        })
      );
    }
    mockResolution(makeResolution({ candidates }));
    const user = userEvent.setup();

    renderPicker({ variantId: undefined });

    await user.click(await screen.findByTestId('sub-picker-show-all'));
    expect(screen.getByTestId('sub-row-105-1005')).toBeInTheDocument();
    expect(screen.getByTestId('sub-row-106-1006')).toBeInTheDocument();
  });

  it('renders the empty state when there are no candidates', async () => {
    mockSearchItems([]);
    mockResolution(makeResolution({ candidates: [] }));

    renderPicker({ variantId: undefined });

    expect(await screen.findByTestId('sub-picker-empty')).toBeInTheDocument();
  });

  it('renders the loading state while the sub query is pending', async () => {
    mockSearchItems([]);
    sdk.substitutionsResolveForLine.mockReturnValue(new Promise(() => undefined));

    renderPicker({ variantId: undefined });

    expect(await screen.findByTestId('sub-picker-loading')).toBeInTheDocument();
  });
});
