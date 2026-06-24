import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { InboxLayout } from '../InboxLayout.js';

import type { InboxTabKey } from '../inbox-tabs.js';

function I18nHost({ children }: { children: ReactElement }): ReactElement {
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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

function makeT(): Parameters<typeof InboxLayout>[0]['t'] {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: 'en-AU',
    fallbackLng: 'en-AU',
    ns: ['food'],
    defaultNS: 'food',
    interpolation: { escapeValue: false },
    resources: { 'en-AU': { food: enAUFood } },
  });
  return instance.getFixedT('en-AU', 'food');
}

function makeProps(over: Partial<Parameters<typeof InboxLayout>[0]> = {}) {
  const tabs: { key: InboxTabKey; label: string }[] = [
    { key: 'drafts', label: 'Drafts' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'failed', label: 'Failed' },
  ];
  const onTabChange = vi.fn();
  return {
    activeTab: 'drafts' as const,
    onTabChange,
    pendingCount: 3,
    tabs,
    t: makeT(),
    children: <div data-testid="panel">drafts panel</div>,
    ...over,
  };
}

describe('InboxLayout', () => {
  it('renders the three tabs with active highlighting', () => {
    render(
      <I18nHost>
        <InboxLayout {...makeProps()} />
      </I18nHost>
    );
    expect(screen.getByTestId('inbox-tab-drafts').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('inbox-tab-rejected').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('inbox-tab-failed').getAttribute('aria-selected')).toBe('false');
  });

  it('fires onTabChange when a non-active tab is clicked', async () => {
    const props = makeProps();
    render(
      <I18nHost>
        <InboxLayout {...props} />
      </I18nHost>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('inbox-tab-rejected'));
    expect(props.onTabChange).toHaveBeenCalledWith('rejected');
  });

  it('renders pendingCount number when present', () => {
    render(
      <I18nHost>
        <InboxLayout {...makeProps({ pendingCount: 7 })} />
      </I18nHost>
    );
    const cell = screen.getByTestId('inbox-pending-count');
    expect(cell.textContent).toMatch(/7 drafts pending/);
  });

  it('renders loading placeholder when pendingCount is null', () => {
    render(
      <I18nHost>
        <InboxLayout {...makeProps({ pendingCount: null })} />
      </I18nHost>
    );
    const cell = screen.getByTestId('inbox-pending-count');
    expect(cell.textContent).toMatch(/Loading/);
  });

  it('caps the badge at 99+ when over 99', () => {
    const tabs: { key: InboxTabKey; label: string; badge: number }[] = [
      { key: 'drafts', label: 'Drafts', badge: 150 },
      { key: 'rejected', label: 'Rejected', badge: 0 },
      { key: 'failed', label: 'Failed', badge: 1 },
    ];
    render(
      <I18nHost>
        <InboxLayout {...makeProps({ tabs })} />
      </I18nHost>
    );
    expect(screen.getByTestId('inbox-tab-drafts').textContent).toMatch(/99\+/);
    // Zero badge is suppressed.
    expect(screen.getByTestId('inbox-tab-rejected').textContent?.trim()).toBe('Rejected');
  });
});
