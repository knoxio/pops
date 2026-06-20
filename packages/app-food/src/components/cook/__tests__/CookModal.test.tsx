/**
 * PRD-144 — RTL coverage for `CookModal`.
 *
 * Mocks the food SDK (`cookPrepareCook` / `cookMarkCooked`) so both are
 * controllable per test. Covers: open-from-recipe-detail pre-fill,
 * yieldless-recipe field hiding, submit happy path, server-error
 * surfacing, submit-disabled when scale is empty.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const cookPrepareCookMock = vi.hoisted(() => vi.fn());
const cookMarkCookedMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  cookPrepareCook: cookPrepareCookMock,
  cookMarkCooked: cookMarkCookedMock,
}));

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

import { CookModal } from '../CookModal.js';

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    []
  );
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
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cookPrepareCookMock.mockReset();
  cookMarkCookedMock.mockReset();
  cookPrepareCookMock.mockResolvedValue({ data: yieldingPrep });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CookModal — render', () => {
  it('shows loading copy until prepare resolves', () => {
    cookPrepareCookMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders fields seeded from prepare data for a yielding recipe', async () => {
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
    cookPrepareCookMock.mockResolvedValue({ data: yieldlessPrep });
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
    cookMarkCookedMock.mockResolvedValue({
      data: { ok: true, recipeRunId: 7, yieldedBatchId: 13 },
    });
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
    expect(cookMarkCookedMock).toHaveBeenCalledWith({
      body: expect.objectContaining({
        recipeVersionId: 42,
        scaleFactor: 1,
        yield: expect.objectContaining({
          qty: 800,
          unit: 'g',
          location: 'fridge',
        }),
      }),
    });
    await waitFor(() => {
      expect(onCookedSuccess).toHaveBeenCalledWith({
        recipeRunId: 7,
        yieldedBatchId: 13,
        location: 'fridge',
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the server error code via i18n on ok:false', async () => {
    cookMarkCookedMock.mockResolvedValue({
      data: { ok: false, reason: 'ShortfallUnresolved' },
    });
    render(
      <Wrapper>
        <CookModal recipeVersionId={1} isOpen onClose={vi.fn()} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/scale factor/i)).toHaveValue('1');
    });
    await userEvent.click(screen.getByRole('button', { name: /mark cooked/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/can.t be covered|shortfall/i);
    });
  });

  it('disables Mark cooked when scaleFactor is empty', async () => {
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
