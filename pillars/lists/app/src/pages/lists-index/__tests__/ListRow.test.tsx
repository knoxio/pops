import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListRow } from '../ListRow';

import type { ListIndexItemView } from '../useListsIndexQuery';

function buildItem(overrides: Partial<ListIndexItemView> = {}): ListIndexItemView {
  return {
    id: 1,
    name: 'Weekly groceries',
    kind: 'shopping',
    ownerApp: 'user',
    itemCount: 5,
    uncheckedCount: 3,
    lastUpdatedAt: '2026-06-09T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

function Host({ item }: { item: ListIndexItemView }): ReactElement {
  const { t } = useTranslation('lists');
  return <ListRow item={item} t={t} />;
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['lists'],
      defaultNS: 'lists',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { lists: enAULists } },
    });
    return instance;
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

describe('PRD-140 part B — ListRow', () => {
  it('links the whole card to /lists/:id', () => {
    render(
      <Wrapper>
        <Host item={buildItem({ id: 7 })} />
      </Wrapper>
    );
    expect(screen.getByRole('link', { name: /weekly groceries/i })).toHaveAttribute(
      'href',
      '/lists/7'
    );
  });

  it('shows the item count and unchecked badge', () => {
    render(
      <Wrapper>
        <Host item={buildItem({ itemCount: 12, uncheckedCount: 4 })} />
      </Wrapper>
    );
    expect(screen.getByText(/12 items/i)).toBeInTheDocument();
    expect(screen.getByText(/4 unchecked/i)).toBeInTheDocument();
  });

  it('shows singular item count', () => {
    render(
      <Wrapper>
        <Host item={buildItem({ itemCount: 1, uncheckedCount: 0 })} />
      </Wrapper>
    );
    expect(screen.getByText(/^1 item ·/i)).toBeInTheDocument();
  });

  it('hides the unchecked badge when count is zero', () => {
    render(
      <Wrapper>
        <Host item={buildItem({ uncheckedCount: 0 })} />
      </Wrapper>
    );
    expect(screen.queryByText(/unchecked/i)).not.toBeInTheDocument();
  });

  it('renders the archived badge when archivedAt is set, and hides unchecked badge', () => {
    render(
      <Wrapper>
        <Host item={buildItem({ archivedAt: '2026-05-30T00:00:00Z', uncheckedCount: 2 })} />
      </Wrapper>
    );
    expect(screen.getByText(/^archived$/i)).toBeInTheDocument();
    expect(screen.queryByText(/unchecked/i)).not.toBeInTheDocument();
  });

  it('renders a kind chip for each kind', () => {
    for (const kind of ['shopping', 'packing', 'todo', 'generic'] as const) {
      const { unmount } = render(
        <Wrapper>
          <Host item={buildItem({ id: 1, kind })} />
        </Wrapper>
      );
      const expected = kind.charAt(0).toUpperCase() + kind.slice(1);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});
