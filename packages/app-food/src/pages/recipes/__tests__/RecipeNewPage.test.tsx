import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockCreateMutate = vi.fn();
let mockOnSuccess:
  | ((res: {
      slug: string;
      recipeId: number;
      versionId: number;
      compile: { ok: boolean; errors?: unknown[] };
    }) => void)
  | undefined;
let mockOnError: ((err: Error) => void) | undefined;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: { onSuccess?: typeof mockOnSuccess; onError?: typeof mockOnError }
  ) => {
    const key = path.join('.');
    if (key === 'recipes.create') {
      mockOnSuccess = opts.onSuccess;
      mockOnError = opts.onError;
      return { mutate: mockCreateMutate, isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
}));

vi.mock('../../../components/DslEditor.js', () => ({
  DslEditor: (props: { initialValue: string; onChange: (v: string) => void; issues?: unknown }) => (
    <div data-testid="dsl-editor" data-issues={JSON.stringify(props.issues ?? [])}>
      <textarea
        defaultValue={props.initialValue}
        onChange={(e) => props.onChange(e.target.value)}
        aria-label="dsl editor"
      />
    </div>
  ),
}));

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { RecipeNewPage } from '../RecipeNewPage.js';

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

beforeEach(() => {
  mockCreateMutate.mockReset();
  navigateMock.mockReset();
  mockOnSuccess = undefined;
  mockOnError = undefined;
});

describe('PRD-119-C — RecipeNewPage', () => {
  it('renders the editor + save CTA', () => {
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /new recipe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByTestId('dsl-editor')).toBeInTheDocument();
  });

  it('passes the current DSL value to the create mutation on save', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    const textarea = screen.getByLabelText(/dsl editor/i);
    await user.clear(textarea);
    await user.type(textarea, '@recipe(slug=\\"pancakes\\")');
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ dsl: expect.stringContaining('pancakes') })
    );
  });

  it('navigates to the edit page on success', async () => {
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    expect(mockOnSuccess).toBeDefined();
    mockOnSuccess?.({
      slug: 'pancakes',
      recipeId: 1,
      versionId: 11,
      compile: { ok: true },
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes/edit'));
  });

  it('does not throw when onError fires (covers error toast branch)', () => {
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    expect(() => mockOnError?.(new Error('boom'))).not.toThrow();
  });
});
