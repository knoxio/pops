import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useState, useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';
import { KindRadioGroup } from '../KindRadioGroup';

import type { ListKind } from '../list-index-types';

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

function Harness({ onChange }: { onChange?: (next: ListKind) => void }): ReactElement {
  const [value, setValue] = useState<ListKind>('shopping');
  return (
    <KindRadioGroup
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('PRD-140 part B — KindRadioGroup', () => {
  it('renders one option per kind', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    for (const label of ['Shopping', 'Packing', 'Todo', 'Generic']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('selects the initial value', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    expect(screen.getByRole('radio', { name: /shopping/i })).toBeChecked();
  });

  it('fires onChange when a different kind is selected', async () => {
    const onChange = vi.fn();
    render(
      <Wrapper>
        <Harness onChange={onChange} />
      </Wrapper>
    );
    await userEvent.click(screen.getByRole('radio', { name: /packing/i }));
    expect(onChange).toHaveBeenCalledWith('packing');
  });
});
