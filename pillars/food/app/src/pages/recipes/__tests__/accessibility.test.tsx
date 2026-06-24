import { render } from '@testing-library/react';
/**
 * axe-core accessibility sweep across the leaf components of the
 * recipe-CRUD flow. Each test renders a static (non-interactive) variant
 * and asserts zero a11y violations.
 *
 * Page-level components are intentionally NOT covered here because they
 * pull in REST mutations + async state machines that would require
 * heavyweight mocks for marginal value — the leaf components are where
 * a11y regressions actually surface (badges, labels, focus order, role
 * hierarchy). Page-level a11y is verified via Storybook addon-a11y.
 *
 * Spec: pillars/food/docs/prds/recipe-crud-pages
 */
import axeCore from 'axe-core';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { AutoCreatedBanner } from '../AutoCreatedBanner.js';
import { MissingCurrentVersionBanner } from '../MissingCurrentVersionBanner.js';
import { RecipeArchiveDialog } from '../RecipeArchiveDialog.js';
import { RecipeListCard } from '../RecipeListCard.js';

import type { RecipeListItemView } from '../useRecipeListQuery.js';

const baseItem: RecipeListItemView = {
  slug: 'banana-pancakes',
  title: 'Banana pancakes',
  recipeType: 'plate',
  heroImagePath: null,
  prepMinutes: 5,
  cookMinutes: 10,
  servings: 2,
  tags: ['breakfast'],
  hasCurrentVersion: true,
  archivedAt: null,
  createdAt: '2026-01-01',
};

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

async function assertNoViolations(container: HTMLElement): Promise<void> {
  const results = await axeCore.run(container, {
    rules: {
      // `region` requires landmarks; tests render the bare component
      // without `<main>` to avoid forcing it into every leaf. Skip.
      region: { enabled: false },
    },
  });
  if (results.violations.length > 0) {
    const formatted = results.violations
      .map((v) => `[${v.id}] ${v.help} — ${v.nodes.length} node(s)`)
      .join('\n');
    throw new Error(`axe-core violations:\n${formatted}`);
  }
  expect(results.violations).toEqual([]);
}

describe('recipe-crud-pages — leaf component accessibility', () => {
  it('RecipeListCard — Default', async () => {
    const { container } = render(
      <Wrapper>
        <RecipeListCard item={baseItem} t={(key) => key} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('RecipeListCard — Archived badge', async () => {
    const { container } = render(
      <Wrapper>
        <RecipeListCard item={{ ...baseItem, archivedAt: '2026-01-15' }} t={(key) => key} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('MissingCurrentVersionBanner', async () => {
    const { container } = render(
      <Wrapper>
        <MissingCurrentVersionBanner slug="banana-pancakes" />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('AutoCreatedBanner — multiple slugs', async () => {
    const { container } = render(
      <Wrapper>
        <AutoCreatedBanner slugs={['dragonfruit', 'mangosteen']} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('RecipeArchiveDialog — open', async () => {
    const { container } = render(
      <Wrapper>
        <RecipeArchiveDialog
          open
          title="Banana pancakes"
          isPending={false}
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </Wrapper>
    );
    await assertNoViolations(container);
  });
});
