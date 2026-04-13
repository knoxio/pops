import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import { useSearchResultNavigation } from './hooks';

/** Displays navigation result and current location for assertions. */
function NavTester({ uri }: { uri: string }) {
  const { navigateTo } = useSearchResultNavigation();
  const location = useLocation();
  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <button onClick={() => navigateTo(uri)}>navigate</button>
    </div>
  );
}

/** Renders inside MemoryRouter + AppContextProvider. */
function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppContextProvider>{ui}</AppContextProvider>
    </MemoryRouter>
  );
}

describe('useSearchResultNavigation', () => {
  it('navigates to resolved route on valid URI', async () => {
    renderAt('/media', <NavTester uri="pops:media/movie/42" />);

    expect(screen.getByTestId('pathname')).toHaveTextContent('/media');

    await act(async () => {
      screen.getByRole('button', { name: 'navigate' }).click();
    });

    expect(screen.getByTestId('pathname')).toHaveTextContent('/media/movies/42');
  });

  it('does not navigate on invalid URI', async () => {
    renderAt('/media', <NavTester uri="invalid:uri" />);

    await act(async () => {
      screen.getByRole('button', { name: 'navigate' }).click();
    });

    expect(screen.getByTestId('pathname')).toHaveTextContent('/media');
  });

  it('returns true on successful navigation', () => {
    let result = false;

    function Tester() {
      const { navigateTo } = useSearchResultNavigation();
      return (
        <button
          onClick={() => {
            result = navigateTo('pops:finance/entity/5');
          }}
        >
          go
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppContextProvider>
          <Tester />
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByRole('button', { name: 'go' }).click();
    });

    expect(result).toBe(true);
  });

  it('returns false on failed navigation', () => {
    let result = true;

    function Tester() {
      const { navigateTo } = useSearchResultNavigation();
      return (
        <button
          onClick={() => {
            result = navigateTo('bad:uri');
          }}
        >
          go
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppContextProvider>
          <Tester />
        </AppContextProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByRole('button', { name: 'go' }).click();
    });

    expect(result).toBe(false);
  });
});
