/**
 * PRD-144 — RTL coverage for `CookModal`.
 *
 * Mocks `@pops/api-client` so `prepareCook` and `markCooked` are both
 * controllable per test. Covers: open-from-recipe-detail pre-fill,
 * yieldless-recipe field hiding, submit happy path, server-error
 * surfacing, submit-disabled when scale is empty.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

type MarkCookedResult =
  | { ok: true; recipeRunId: number; yieldedBatchId: number | null }
  | { ok: false; reason: string };

const yieldingPrep = {
  recipeTitle: 'Chicken Tikka Masala',
  recipeSlug: 'tikka-masala',
  versionNo: 1,
  defaultScaleFactor: 1,
  yieldsBatch: true,
  yieldDefault: {
    qty: 800,
    unit: 'g' as const,
    variantName: 'Default',
    prepStateLabel: null,
    shelfLifeFridgeDays: 3,
    shelfLifeFreezerDays: 60,
  },
  consumeNeeds: [],
  alreadyCooked: false,
};

const yieldlessPrep = {
  ...yieldingPrep,
  yieldsBatch: false,
  yieldDefault: null,
};

const mockPrepareCook = vi.fn();
const mockMarkCookedMutate = vi.fn();
const mockInvalidate = vi.fn();
let capturedMutationOptions: {
  onSuccess?: (result: MarkCookedResult, input: { yield?: { location: string } }) => void;
  onError?: (err: Error) => void;
} = {};
let mockMarkCookedPending = false;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts?: unknown) => {
    const key = path.join('.');
    if (key === 'cook.prepareCook') return mockPrepareCook(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: {
      onSuccess?: (result: MarkCookedResult, input: { yield?: { location: string } }) => void;
      onError?: (err: Error) => void;
    }
  ) => {
    const key = path.join('.');
    if (key === 'cook.markCooked') {
      capturedMutationOptions = opts;
      return {
        mutate: (input: unknown) => mockMarkCookedMutate(input),
        isPending: mockMarkCookedPending,
      };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: (path: readonly string[]) => mockInvalidate(path),
  }),
}));

import { CookModal } from '../CookModal.js';

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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

function loaded(prep = yieldingPrep) {
  return { isLoading: false, data: prep, error: null, refetch: vi.fn() };
}

beforeEach(() => {
  mockPrepareCook.mockReset();
  mockMarkCookedMutate.mockReset();
  mockInvalidate.mockReset();
  capturedMutationOptions = {};
  mockMarkCookedPending = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CookModal — render', () => {
  it('shows loading copy until prepare resolves', () => {
    mockPrepareCook.mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders fields seeded from prepare data for a yielding recipe', async () => {
    mockPrepareCook.mockReturnValue(loaded());
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toHaveValue('1');
    });
    expect(screen.getByLabelText(/yield qty/i)).toHaveValue('800');
    expect(screen.getByLabelText(/expires/i)).toBeInTheDocument();
  });

  it('hides yield + location + expires for a yieldless recipe', async () => {
    mockPrepareCook.mockReturnValue(loaded(yieldlessPrep));
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/yield qty/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/expires/i)).not.toBeInTheDocument();
  });
});

describe('CookModal — submit', () => {
  it('submits markCooked with the form values + closes on ok:true', async () => {
    mockPrepareCook.mockReturnValue(loaded());
    const onClose = vi.fn();
    const onCookedSuccess = vi.fn();
    render(
      <Wrapper>
        <CookModal
          recipeVersionId={42}
          isOpen
          onClose={onClose}
          onCookedSuccess={onCookedSuccess}
        />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toHaveValue('1');
    });
    await userEvent.click(screen.getByRole('button', { name: /mark cooked/i }));
    expect(mockMarkCookedMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeVersionId: 42,
        scaleFactor: 1,
        yield: expect.objectContaining({
          qty: 800,
          unit: 'g',
          location: 'fridge',
        }),
      })
    );
    capturedMutationOptions.onSuccess?.(
      { ok: true, recipeRunId: 7, yieldedBatchId: 13 },
      { yield: { location: 'fridge' } }
    );
    expect(onCookedSuccess).toHaveBeenCalledWith({
      recipeRunId: 7,
      yieldedBatchId: 13,
      location: 'fridge',
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('surfaces the server error code via i18n on ok:false', async () => {
    mockPrepareCook.mockReturnValue(loaded());
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toHaveValue('1');
    });
    await userEvent.click(screen.getByRole('button', { name: /mark cooked/i }));
    capturedMutationOptions.onSuccess?.(
      { ok: false, reason: 'ShortfallUnresolved' },
      { yield: { location: 'fridge' } }
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/can.t be covered|shortfall/i);
    });
  });

  it('disables Mark cooked when scaleFactor is empty', async () => {
    mockPrepareCook.mockReturnValue(loaded());
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toHaveValue('1');
    });
    await userEvent.clear(screen.getByLabelText(/scale factor/i));
    expect(screen.getByRole('button', { name: /mark cooked/i })).toBeDisabled();
  });
});
