/**
 * NotInstalledPage tests.
 *
 * The page renders for catch-all matches; the requested module id is
 * derived from the URL's first path segment. These tests confirm the
 * module id surfaces in the message regardless of subpath depth.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { NotInstalledPage } from './NotInstalledPage';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <NotInstalledPage />
    </MemoryRouter>
  );
}

describe('NotInstalledPage', () => {
  it('extracts the module id from the URL first segment', () => {
    renderAt('/media');
    expect(screen.getByText(/module not installed/i)).toBeInTheDocument();
    // The id appears in a <code> element inside the message paragraph.
    expect(screen.getByText('media')).toBeInTheDocument();
  });

  it('extracts the module id when the URL has a sub-path', () => {
    renderAt('/media/movies/42');
    expect(screen.getByText('media')).toBeInTheDocument();
  });

  it('shows the full requested pathname in the message', () => {
    renderAt('/finance/transactions');
    expect(screen.getByText('/finance/transactions')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
  });

  it('falls back gracefully when the URL has no segment (root)', () => {
    renderAt('/');
    expect(screen.getByText(/module not installed/i)).toBeInTheDocument();
    // No module id available; the fallback word is rendered instead.
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
  });
});
