import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useState, useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import enAULists from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';
import { DEFAULT_FILTERS, type ListsIndexFilterState } from '../list-index-types';
import { ListsIndexFilters } from '../ListsIndexFilters';

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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

function Harness({
  initial = DEFAULT_FILTERS,
  onState,
}: {
  initial?: ListsIndexFilterState;
  onState?: (s: ListsIndexFilterState) => void;
}): ReactElement {
  const [state, setState] = useState<ListsIndexFilterState>(initial);
  return (
    <ListsIndexFilters
      value={state}
      onChange={(next) => {
        setState(next);
        onState?.(next);
      }}
    />
  );
}

describe('PRD-140 part B — ListsIndexFilters', () => {
  it('renders one chip per kind', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    for (const kind of ['Shopping', 'Packing', 'Todo', 'Generic']) {
      expect(screen.getByRole('button', { name: kind })).toBeInTheDocument();
    }
  });

  it('starts with every kind chip active (PRD-140 §Index "default: all selected")', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    for (const kind of ['Shopping', 'Packing', 'Todo', 'Generic']) {
      expect(screen.getByRole('button', { name: kind })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('toggles a kind chip off and back on', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    const chip = screen.getByRole('button', { name: 'Shopping' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles the show-archived checkbox', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    const checkbox = screen.getByRole('checkbox', { name: /show archived/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('changes the sort option', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('updated');
    await user.selectOptions(select, 'name');
    expect(select).toHaveValue('name');
  });

  it('shows the clear button when filters differ from the default, and resets them on click', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <Harness initial={{ kinds: ['shopping'], includeArchived: true, sort: 'name' }} />
      </Wrapper>
    );
    const clear = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clear);
    // Reset returns to default: all kinds active, archived off, updated sort.
    expect(screen.getByRole('button', { name: 'Shopping' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Packing' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: /show archived/i })).not.toBeChecked();
    expect(screen.getByRole('combobox')).toHaveValue('updated');
  });

  it('hides the clear button when the filter state matches the default', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});
