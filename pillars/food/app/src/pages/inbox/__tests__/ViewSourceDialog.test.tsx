/**
 * PRD-138 — RTL coverage for the ViewSourceDialog.
 *
 *   - renders nothing when row is null
 *   - URL kinds render a clickable link + sandboxed iframe
 *   - screenshot kind renders an <img> pointing at the source endpoint
 *   - text kind renders the placeholder
 *   - Close button fires onClose
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { type FailedRow } from '../inbox-types.js';
import { ViewSourceDialog } from '../ViewSourceDialog.js';

// ResizeObserver polyfill lives in `src/test-setup.ts` (guarded behind
// `typeof === 'undefined'` so a future jsdom update with a real
// implementation isn't masked here).

function row(over: Partial<FailedRow>): FailedRow {
  return {
    sourceId: 5,
    ingestKind: 'url-web',
    sourceUrl: 'https://example.com',
    errorCode: 'Timeout',
    errorMessage: 'Timed out',
    ingestedAt: '2026-06-10T12:00:00Z',
    attempts: 1,
    ...over,
  };
}

function renderDialog(r: FailedRow | null, onClose = () => {}): void {
  function Wrapper(): ReactElement {
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
        <ViewSourceDialog row={r} onClose={onClose} t={i18n.getFixedT('en-AU', 'food')} />
      </I18nextProvider>
    );
  }
  render(<Wrapper />);
}

describe('ViewSourceDialog — PRD-138', () => {
  it('renders nothing when row is null', () => {
    renderDialog(null);
    expect(screen.queryByTestId('view-source-dialog')).toBeNull();
  });

  it('renders a clickable link + sandboxed iframe for url-web', () => {
    renderDialog(row({ ingestKind: 'url-web', sourceUrl: 'https://example.com/recipes/123' }));
    const link = screen.getByRole('link', { name: /https:\/\/example.com/i });
    expect(link).toHaveAttribute('href', 'https://example.com/recipes/123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const iframe = screen.getByTitle('Source page preview');
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(iframe).toHaveAttribute('src', 'https://example.com/recipes/123');
  });

  it('renders an <img> for screenshot kind pointing at /food-api/ingest/source/:id/screenshot', () => {
    renderDialog(row({ ingestKind: 'screenshot', sourceUrl: null, sourceId: 99 }));
    const img = screen.getByRole('img', { name: 'Ingested screenshot' });
    expect(img).toHaveAttribute('src', '/food-api/ingest/source/99/screenshot');
  });

  it('renders the placeholder copy for text kind', () => {
    renderDialog(row({ ingestKind: 'text', sourceUrl: null }));
    expect(
      screen.getByText(/Open the inspector view to read the pasted text/i)
    ).toBeInTheDocument();
  });

  it('renders a “Close” affordance + fires onClose on click', async () => {
    const onClose = vi.fn();
    renderDialog(row({}), onClose);
    // Radix's DialogContent always ships an X close button + the
    // DialogFooter `showCloseButton` renders an explicit Close button. Both
    // wire through Radix's close mechanism — pick the explicit footer one
    // for the assertion.
    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
    await userEvent.setup().click(closeBtns[closeBtns.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });
});
