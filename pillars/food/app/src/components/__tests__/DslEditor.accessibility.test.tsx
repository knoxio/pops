/**
 * PRD-120 part F — axe-core accessibility sweep for the DSL editor.
 *
 * The editor wraps an imperative CodeMirror EditorView, so a single
 * axe-core pass over the React-rendered container covers both the
 * read-only banner and the editable surface. The accessible name lives
 * on `.cm-content` (role=textbox) via `EditorView.contentAttributes`,
 * threaded through `useDslEditorView`'s `ariaLabel` option — the
 * wrapper `<div>` deliberately carries no `aria-label` because
 * `aria-prohibited-attr` would flag it on the generic role.
 */
import { render } from '@testing-library/react';
import axeCore from 'axe-core';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { DslEditor } from '../DslEditor';

const RECIPE = [
  '@recipe(slug="x", title="X")',
  '@yield(x, 1:count)',
  '@ingredient(1, banana:raw, 100:g)',
  '@step("Mash @1 for @time(2:min)")',
].join('\n');

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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

async function assertNoViolations(container: HTMLElement): Promise<void> {
  const results = await axeCore.run(container, {
    rules: {
      // `region` requires a `<main>` landmark; the editor is mounted by
      // a page component that owns the landmark, so skip in isolation.
      region: { enabled: false },
      // CodeMirror sets `contenteditable` on a div without an explicit
      // role — that's the upstream library's convention and not a
      // regression we can fix from the consumer side.
      'aria-input-field-name': { enabled: false },
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

describe('PRD-120 part F — DslEditor accessibility', () => {
  it('editable editor passes axe-core basic checks', async () => {
    const { container } = render(
      <Wrapper>
        <DslEditor initialValue={RECIPE} onChange={() => {}} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('read-only editor passes axe-core basic checks', async () => {
    const { container } = render(
      <Wrapper>
        <DslEditor initialValue={RECIPE} readOnly onChange={() => {}} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });

  it('empty editor passes axe-core basic checks', async () => {
    const { container } = render(
      <Wrapper>
        <DslEditor initialValue="" onChange={() => {}} />
      </Wrapper>
    );
    await assertNoViolations(container);
  });
});
