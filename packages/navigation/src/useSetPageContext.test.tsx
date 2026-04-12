import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import type { SetPageContextOptions } from './hooks';
import { useAppContext } from './hooks';
import { useSetPageContext } from './hooks';

/** Renders children inside a MemoryRouter + AppContextProvider at the given path. */
function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppContextProvider>{ui}</AppContextProvider>
    </MemoryRouter>
  );
}

/** Page component that calls useSetPageContext and displays the resulting context. */
function TestPage(props: SetPageContextOptions) {
  useSetPageContext(props);
  const ctx = useAppContext();
  return (
    <div>
      <span data-testid="page">{ctx.page ?? 'null'}</span>
      <span data-testid="pageType">{ctx.pageType}</span>
      <span data-testid="entity">{ctx.entity ? ctx.entity.title : 'none'}</span>
      <span data-testid="filters">{ctx.filters ? JSON.stringify(ctx.filters) : 'none'}</span>
    </div>
  );
}

/** Reads context without setting it — used to verify cleared state after unmount. */
function ContextReader() {
  const ctx = useAppContext();
  return (
    <div>
      <span data-testid="page">{ctx.page ?? 'null'}</span>
      <span data-testid="pageType">{ctx.pageType}</span>
      <span data-testid="entity">{ctx.entity ? ctx.entity.title : 'none'}</span>
      <span data-testid="filters">{ctx.filters ? JSON.stringify(ctx.filters) : 'none'}</span>
    </div>
  );
}

describe('useSetPageContext', () => {
  it('sets page context on mount', async () => {
    renderAt('/media', <TestPage page="library" />);

    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('library');
      expect(screen.getByTestId('pageType')).toHaveTextContent('top-level');
    });
  });

  it('sets pageType when provided', async () => {
    renderAt('/media', <TestPage page="movie-detail" pageType="drill-down" />);

    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('movie-detail');
      expect(screen.getByTestId('pageType')).toHaveTextContent('drill-down');
    });
  });

  it('sets entity on drill-down pages', async () => {
    const entity = { uri: 'pops:media/movie/42', type: 'movie', title: 'Fight Club' };
    renderAt('/media', <TestPage page="movie-detail" pageType="drill-down" entity={entity} />);

    await waitFor(() => {
      expect(screen.getByTestId('entity')).toHaveTextContent('Fight Club');
    });
  });

  it('sets filters on list pages', async () => {
    renderAt(
      '/finance',
      <TestPage page="transactions" filters={{ category: 'food', month: '2026-03' }} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('filters')).toHaveTextContent(
        JSON.stringify({ category: 'food', month: '2026-03' })
      );
    });
  });

  it('clears context on unmount', async () => {
    function Toggler() {
      const [showPage, setShowPage] = useState(true);
      return (
        <div>
          {showPage ? <TestPage page="library" /> : <ContextReader />}
          <button onClick={() => setShowPage(false)}>unmount</button>
        </div>
      );
    }

    renderAt('/media', <Toggler />);

    // Page is set
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('library');
    });

    // Unmount the page component
    act(() => {
      screen.getByRole('button', { name: 'unmount' }).click();
    });

    // Context should be cleared
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveTextContent('null');
      expect(screen.getByTestId('pageType')).toHaveTextContent('top-level');
      expect(screen.getByTestId('entity')).toHaveTextContent('none');
    });
  });

  it('clears entity and filters on unmount after drill-down', async () => {
    const entity = { uri: 'pops:media/movie/42', type: 'movie', title: 'Fight Club' };

    function Toggler() {
      const [showPage, setShowPage] = useState(true);
      return (
        <div>
          {showPage ? (
            <TestPage
              page="movie-detail"
              pageType="drill-down"
              entity={entity}
              filters={{ tab: 'cast' }}
            />
          ) : (
            <ContextReader />
          )}
          <button onClick={() => setShowPage(false)}>unmount</button>
        </div>
      );
    }

    renderAt('/media', <Toggler />);

    await waitFor(() => {
      expect(screen.getByTestId('entity')).toHaveTextContent('Fight Club');
      expect(screen.getByTestId('filters')).toHaveTextContent(JSON.stringify({ tab: 'cast' }));
    });

    act(() => {
      screen.getByRole('button', { name: 'unmount' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('entity')).toHaveTextContent('none');
      expect(screen.getByTestId('filters')).toHaveTextContent('none');
    });
  });
});
