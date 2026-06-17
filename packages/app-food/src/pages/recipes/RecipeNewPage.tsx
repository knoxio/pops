import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { recipesCreate } from '../../food-api/index.js';
import { DslEditor } from '../../components/DslEditor.js';
import { asCompileResult } from './recipe-payloads.js';

import type { CompileEditorIssue } from '../../components/dsl-editor/issues-types.js';

const EMPTY_DSL = '@recipe(slug="", title="")\n@yield(_, 1:count)\n';

/**
 * `/food/recipes/new` — type a DSL, save, land on the edit page for the
 * fresh draft. Compile errors flow back through the editor as inline
 * diagnostics so the author fixes them in place.
 */
export function RecipeNewPage(): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const [dsl, setDsl] = useState(EMPTY_DSL);
  const [issues, setIssues] = useState<readonly CompileEditorIssue[]>([]);

  const createMutation = useMutation({
    mutationFn: async (body: { dsl: string }) => {
      const result = unwrap(await recipesCreate({ body }));
      return { slug: result.slug, compile: asCompileResult(result.compile) };
    },
    onSuccess: (result) => {
      const compile = result.compile;
      if (compile.ok === true) {
        toast.success(t('recipes.new.saved'));
      } else {
        setIssues(compileErrorsToIssues(compile.errors));
        toast.error(t('recipes.new.compileError'));
      }
      // Redirect in both paths — the draft exists either way, and the
      // edit page surfaces compile errors inline via PRD-120-C `issues`.
      void navigate(`/food/recipes/${result.slug}/edit`);
    },
    onError: (err: Error) => {
      toast.error(t('recipes.new.error', { message: err.message }));
    },
  });

  const onSave = useCallback(() => {
    setIssues([]);
    createMutation.mutate({ dsl });
  }, [createMutation, dsl]);

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('recipes.new.title')}</h1>
        <Button onClick={onSave} disabled={createMutation.isPending}>
          {createMutation.isPending ? t('recipes.new.savingPending') : t('recipes.new.saveCta')}
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">{t('recipes.new.intro')}</p>
      <DslEditor initialValue={dsl} onChange={setDsl} issues={issues} />
    </div>
  );
}

const ORIGIN = { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };

interface MaybeLocated {
  code: string;
  message: string;
  loc?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

function compileErrorsToIssues(errors: readonly MaybeLocated[]): CompileEditorIssue[] {
  return errors.map((e) => ({
    severity: 'error',
    code: e.code,
    message: e.message,
    loc: e.loc ?? ORIGIN,
  }));
}
