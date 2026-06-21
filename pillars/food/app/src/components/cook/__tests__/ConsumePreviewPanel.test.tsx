/**
 * PRD-146 — RTL coverage for `ConsumePreviewPanel`.
 *
 *  - happy path: 8 fully-covered lines; panel auto-collapsed when no
 *    shortfalls exist
 *  - expanding shows the first N rows + a "show 3 more" expander
 *  - shortfall presence flips the panel to expanded-by-default
 *  - empty-need state renders the dashed empty card
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ConsumePreviewPanel } from '../ConsumePreviewPanel.js';

import type { LineConsumeNeed, LineResolution } from '../cook-resolution-types.js';

function makeNeed(lineIndex: number, name: string): LineConsumeNeed {
  return {
    lineIndex,
    ingredientId: 100 + lineIndex,
    ingredientName: name,
    variantId: 200 + lineIndex,
    variantName: 'Default',
    prepStateId: null,
    prepStateLabel: null,
    qty: 100,
    canonicalUnit: 'g',
    optional: false,
  };
}

function fifoFor(needs: readonly LineConsumeNeed[]): Map<number, LineResolution> {
  const map = new Map<number, LineResolution>();
  for (const n of needs) map.set(n.lineIndex, { kind: 'fifo' });
  return map;
}

describe('ConsumePreviewPanel — PRD-146', () => {
  it('renders the empty state when no lines are resolved', () => {
    render(<ConsumePreviewPanel lineNeeds={[]} resolutionMap={new Map()} hasShortfalls={false} />);
    expect(screen.getByText(/no ingredient lines to consume/i)).toBeInTheDocument();
  });

  it('auto-collapses on the happy path (no shortfalls) and reveals the list on expand', async () => {
    const user = userEvent.setup();
    const needs = [makeNeed(1, 'Onion'), makeNeed(2, 'Chicken')];
    render(
      <ConsumePreviewPanel lineNeeds={needs} resolutionMap={fifoFor(needs)} hasShortfalls={false} />
    );

    expect(screen.queryByTestId('consume-preview-list')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /consume preview/i }));
    expect(screen.getByTestId('consume-preview-list')).toBeInTheDocument();
  });

  it('renders expanded-by-default when shortfalls exist and shows a "show more" expander past the collapse limit', async () => {
    const user = userEvent.setup();
    const needs = Array.from({ length: 8 }, (_, i) => makeNeed(i + 1, `Ingredient ${i + 1}`));
    render(
      <ConsumePreviewPanel lineNeeds={needs} resolutionMap={fifoFor(needs)} hasShortfalls={true} />
    );
    expect(screen.getByTestId('consume-preview-list')).toBeInTheDocument();
    const moreButton = screen.getByRole('button', { name: /show 3 more covered lines/i });
    await user.click(moreButton);
    expect(
      screen.queryByRole('button', { name: /show 3 more covered lines/i })
    ).not.toBeInTheDocument();
  });
});
