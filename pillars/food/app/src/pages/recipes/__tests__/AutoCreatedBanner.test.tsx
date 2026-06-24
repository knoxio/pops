import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { AutoCreatedBanner } from '../AutoCreatedBanner.js';

function Wrapper({ children }: { children: ReactElement }): ReactElement {
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
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

describe('recipe-crud-pages — AutoCreatedBanner', () => {
  it('renders nothing when the slug list is empty', () => {
    const { container } = render(
      <Wrapper>
        <AutoCreatedBanner slugs={[]} />
      </Wrapper>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders each slug as a focusable /food/data?focus=<slug> link', () => {
    render(
      <Wrapper>
        <AutoCreatedBanner slugs={['dragonfruit', 'cherimoya']} />
      </Wrapper>
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/food/data?focus=dragonfruit');
    expect(links[1]).toHaveAttribute('href', '/food/data?focus=cherimoya');
  });

  it('hides when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <AutoCreatedBanner slugs={['dragonfruit']} />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
