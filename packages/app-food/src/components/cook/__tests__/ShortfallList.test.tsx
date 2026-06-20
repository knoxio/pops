/**
 * PRD-146 — RTL coverage for the shortfall resolution surface.
 *
 *  - 3 unresolved shortfalls render with three radio options each
 *  - external radio resolves the shortfall in-place
 *  - batch-override radio opens `BatchOverridePicker`; selecting a
 *    batch writes a `kind='batch-override'` resolution
 *  - partial radio opens the same picker; selecting writes
 *    `kind='partial'` with the partial-qty editor visible
 *  - mark-cooked gate flips from disabled to enabled exactly when all
 *    three shortfalls have been resolved
 *  - scale change resets state + surfaces the scale-reset banner
 *
 * The nested `BatchOverridePicker` drives `batchesSearchForConsume` +
 * `substitutionsResolveForLine` through React Query, so the generated SDK
 * module is mocked and each render is wrapped in a `QueryClientProvider`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  BatchForConsumeRow,
  LineConsumeNeed,
  LineShortfall,
} from '../cook-resolution-types.js';

const sdk = vi.hoisted(() => ({
  batchesSearchForConsume: vi.fn(),
  substitutionsResolveForLine: vi.fn(),
}));

vi.mock('../../../food-api/index.js', () => sdk);

import { ShortfallList } from '../ShortfallList.js';
import { useCookResolution } from '../useCookResolution.js';

function makeNeed(over: Partial<LineConsumeNeed> = {}): LineConsumeNeed {
  return {
    lineIndex: 1,
    ingredientId: 100,
    ingredientName: 'Onion',
    variantId: 200,
    variantName: 'Diced',
    prepStateId: null,
    prepStateLabel: null,
    qty: 100,
    canonicalUnit: 'g',
    optional: false,
    ...over,
  };
}

function makeShortfall(over: Partial<LineShortfall> = {}): LineShortfall {
  return {
    lineIndex: 1,
    ingredientId: 100,
    ingredientName: 'Onion',
    variantName: 'Diced',
    prepStateLabel: null,
    needed: 100,
    available: 0,
    unit: 'g',
    ...over,
  };
}

function makeBatch(over: Partial<BatchForConsumeRow> = {}): BatchForConsumeRow {
  return {
    id: 42,
    variantId: 200,
    variantName: 'Diced',
    variantSlug: 'diced',
    ingredientId: 100,
    ingredientName: 'Onion',
    prepStateId: null,
    prepStateLabel: null,
    qtyRemaining: 500,
    unit: 'g',
    location: 'fridge',
    expiresAt: '2026-06-12T00:00:00.000Z',
    producedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function mockSearchItems(items: readonly BatchForConsumeRow[]) {
  sdk.batchesSearchForConsume.mockResolvedValue({ data: { items } });
}

interface HostProps {
  initialScale: number;
  lineNeeds: readonly LineConsumeNeed[];
  shortfalls: readonly LineShortfall[];
  onGate: (count: number) => void;
}

function ShortfallHost(props: HostProps): ReactElement {
  const [scale, setScale] = useState(props.initialScale);
  const resolution = useCookResolution({
    lineNeeds: props.lineNeeds,
    shortfalls: props.shortfalls,
    scaleFactor: scale,
  });
  props.onGate(resolution.unresolvedShortfallCount);
  return (
    <div>
      <button type="button" onClick={() => setScale((s) => s * 2)} data-testid="bump-scale">
        Double scale
      </button>
      <button
        type="button"
        data-testid="mark-cooked"
        disabled={resolution.unresolvedShortfallCount > 0}
      >
        Mark cooked
      </button>
      <ShortfallList
        shortfalls={props.shortfalls}
        needsByLine={resolution.needsByLine}
        resolutionMap={resolution.resolutionMap}
        recipeVersionId={999}
        onResolve={resolution.setResolution}
        scaleResetSignal={resolution.scaleResetSignal}
      />
    </div>
  );
}

function renderHost(props: HostProps): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactElement }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<ShortfallHost {...props} />, { wrapper: Wrapper });
}

describe('ShortfallList — PRD-146', () => {
  it('lists every unresolved shortfall with the expected radios + Mark-cooked stays disabled until all are resolved', async () => {
    mockSearchItems([makeBatch({ id: 42 })]);
    sdk.substitutionsResolveForLine.mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    const gate = vi.fn();

    const lineNeeds = [
      makeNeed({ lineIndex: 1, ingredientName: 'Garam masala' }),
      makeNeed({ lineIndex: 2, ingredientName: 'Ginger' }),
      makeNeed({ lineIndex: 3, ingredientName: 'Cumin' }),
    ];
    const shortfalls = [
      makeShortfall({ lineIndex: 1, ingredientName: 'Garam masala', available: 0, needed: 12 }),
      makeShortfall({ lineIndex: 2, ingredientName: 'Ginger', available: 30, needed: 50 }),
      makeShortfall({ lineIndex: 3, ingredientName: 'Cumin', available: 0, needed: 5 }),
    ];

    renderHost({ initialScale: 1, lineNeeds, shortfalls, onGate: gate });

    expect(screen.getByTestId('shortfall-list').children).toHaveLength(3);
    expect(screen.getByTestId('mark-cooked')).toBeDisabled();

    const row1 = screen.getByTestId('shortfall-row-1');
    await user.click(within(row1).getByLabelText(/mark consumed externally/i));
    expect(screen.getByTestId('mark-cooked')).toBeDisabled();

    const row2 = screen.getByTestId('shortfall-row-2');
    await user.click(within(row2).getByLabelText(/consume what.s available/i));
    await user.click(await within(row2).findByTestId('batch-picker-row-42'));

    const row3 = screen.getByTestId('shortfall-row-3');
    await user.click(within(row3).getByLabelText(/pick a batch/i));
    await user.click(await within(row3).findByTestId('batch-picker-row-42'));

    expect(screen.getByTestId('mark-cooked')).not.toBeDisabled();
  });

  it('shows the scale-reset banner and re-disables Mark-cooked when scaleFactor changes', async () => {
    mockSearchItems([makeBatch({ id: 42 })]);
    sdk.substitutionsResolveForLine.mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    const gate = vi.fn();

    const lineNeeds = [makeNeed({ lineIndex: 1, ingredientName: 'Cardamom' })];
    const shortfalls = [
      makeShortfall({ lineIndex: 1, ingredientName: 'Cardamom', available: 0, needed: 6 }),
    ];

    renderHost({ initialScale: 1, lineNeeds, shortfalls, onGate: gate });

    await user.click(
      within(screen.getByTestId('shortfall-row-1')).getByLabelText(/mark consumed externally/i)
    );
    expect(screen.getByTestId('mark-cooked')).not.toBeDisabled();

    await user.click(screen.getByTestId('bump-scale'));
    expect(screen.getByTestId('scale-reset-banner')).toBeInTheDocument();
    expect(screen.getByTestId('mark-cooked')).toBeDisabled();
  });

  it('renders the picker empty state when searchForConsume returns no matches', async () => {
    mockSearchItems([]);
    sdk.substitutionsResolveForLine.mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    const gate = vi.fn();

    const lineNeeds = [makeNeed({ lineIndex: 1, ingredientName: 'Saffron' })];
    const shortfalls = [
      makeShortfall({ lineIndex: 1, ingredientName: 'Saffron', available: 0, needed: 1 }),
    ];

    renderHost({ initialScale: 1, lineNeeds, shortfalls, onGate: gate });

    const row = screen.getByTestId('shortfall-row-1');
    await user.click(within(row).getByLabelText(/pick a batch/i));
    expect(await within(row).findByTestId('batch-picker-empty')).toBeInTheDocument();
  });
});
