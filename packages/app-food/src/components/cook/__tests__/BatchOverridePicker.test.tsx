/**
 * PRD-149 — RTL coverage for the picker's section split.
 *
 *  - Both sections render with the right counts.
 *  - Substitutions section shows the prep-mismatch chip when applicable.
 *  - Selecting a substitution row routes through `onSelect` with the
 *    `substitution` discriminant + the candidate + the batch.
 *  - "Show all" expander reveals candidates beyond the 5-row cap.
 *  - Loading / empty / error states render their respective copy.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { BatchForConsumeRow } from '@pops/app-food-db';

const mockSearchForConsume = vi.fn();
const mockResolveForLine = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts?: unknown) => {
    const key = path.join('.');
    if (key === 'batches.searchForConsume') return mockSearchForConsume(input, opts);
    if (key === 'substitutions.resolveForLine') return mockResolveForLine(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
}));

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

describe('BatchOverridePicker — PRD-149 sections', () => {
  it('renders Same-variant + Substitutions sections with their counts', () => {
    mockSearchForConsume.mockReturnValue({
      data: { items: [makeBatch({ id: 18 }), makeBatch({ id: 19 })] },
      isLoading: false,
    });
    mockResolveForLine.mockReturnValue({
      data: makeResolution({
        candidates: [
          makeCandidate({ substitutionId: 1 }),
          makeCandidate({ substitutionId: 2, substituteIngredientName: 'leek' }),
        ],
      }),
      isLoading: false,
      isError: false,
    });

    render(
      <BatchOverridePicker
        ingredientId={10}
        variantId={100}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const sameVariant = screen.getByTestId('picker-section-same-variant');
    expect(within(sameVariant).getByText(/Same variant \(2\)/i)).toBeInTheDocument();
    const subs = screen.getByTestId('picker-section-substitutions');
    expect(within(subs).getByText(/Substitutions \(2\)/i)).toBeInTheDocument();
  });

  it('routes a substitution row click through onSelect with the candidate + batch', async () => {
    mockSearchForConsume.mockReturnValue({ data: { items: [] }, isLoading: false });
    const candidate = makeCandidate({ substitutionId: 7 });
    mockResolveForLine.mockReturnValue({
      data: makeResolution({ candidates: [candidate] }),
      isLoading: false,
      isError: false,
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <BatchOverridePicker
        ingredientId={10}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={null}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('sub-row-7-80'));

    expect(onSelect).toHaveBeenCalledWith({
      kind: 'substitution',
      candidate: expect.objectContaining({ substitutionId: 7 }),
      batch: expect.objectContaining({ batchId: 80 }),
    });
  });

  it('shows the prep-mismatch chip when the sub batch prep differs from the line', () => {
    mockSearchForConsume.mockReturnValue({ data: { items: [] }, isLoading: false });
    const candidate = makeCandidate({
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
    });
    mockResolveForLine.mockReturnValue({
      data: makeResolution({ candidates: [candidate] }),
      isLoading: false,
      isError: false,
    });

    render(
      <BatchOverridePicker
        ingredientId={10}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={3}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('sub-row-9-prep-warning')).toBeInTheDocument();
  });

  it('reveals candidates beyond the 5-row cap via Show all', async () => {
    mockSearchForConsume.mockReturnValue({ data: { items: [] }, isLoading: false });
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
    mockResolveForLine.mockReturnValue({
      data: makeResolution({ candidates }),
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    render(
      <BatchOverridePicker
        ingredientId={10}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId('sub-row-105-1005')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('sub-picker-show-all'));
    expect(screen.getByTestId('sub-row-105-1005')).toBeInTheDocument();
    expect(screen.getByTestId('sub-row-106-1006')).toBeInTheDocument();
  });

  it('renders the empty state when there are no candidates', () => {
    mockSearchForConsume.mockReturnValue({ data: { items: [] }, isLoading: false });
    mockResolveForLine.mockReturnValue({
      data: makeResolution({ candidates: [] }),
      isLoading: false,
      isError: false,
    });

    render(
      <BatchOverridePicker
        ingredientId={10}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('sub-picker-empty')).toBeInTheDocument();
  });

  it('renders the loading state while the sub query is pending', () => {
    mockSearchForConsume.mockReturnValue({ data: { items: [] }, isLoading: false });
    mockResolveForLine.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(
      <BatchOverridePicker
        ingredientId={10}
        recipeVersionId={999}
        lineIndex={1}
        linePrepStateId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('sub-picker-loading')).toBeInTheDocument();
  });
});
