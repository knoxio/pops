/**
 * PRD-135 — editor pane.
 *
 * Two tabs: Editor (mounts PRD-120's `DslEditor`, debounced save) and
 * Renderer (lazy-loads PRD-121's `RecipeRenderer` via
 * `food.recipes.getForRendering`). Save fires `food.recipes.saveDraft`
 * and on success invalidates the inspector query so the band + signals +
 * proposed slugs refresh.
 *
 * Archived versions render the editor in `readOnly` mode and hide the
 * Save button; the renderer remains live for archived versions (a
 * frozen view of what was archived).
 */
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

import { DslEditor } from '../../../components/DslEditor.js';
import { InspectorRenderer } from './InspectorRenderer.js';

import type { InspectorDraftView } from '@pops/app-food-db';

type EditorTab = 'editor' | 'renderer';

interface Props {
  draft: InspectorDraftView;
  onSaved: () => void;
  pendingCursor?: { line: number; col: number; nonce: number };
}

export function EditorPane({ draft, onSaved, pendingCursor }: Props): ReactElement {
  const { t } = useTranslation('food');
  const [tab, setTab] = useState<EditorTab>('editor');
  const [body, setBody] = useState(draft.bodyDsl);
  const isReadOnly = draft.status === 'archived';

  return (
    <section className="space-y-3" data-testid="inspector-editor-pane">
      <EditorTabs tab={tab} onChange={setTab} t={t} />
      {tab === 'editor' && (
        <EditorTab
          draft={draft}
          body={body}
          onChange={setBody}
          isReadOnly={isReadOnly}
          onSaved={onSaved}
          pendingCursor={pendingCursor}
          t={t}
        />
      )}
      {tab === 'renderer' && (
        <InspectorRenderer
          slug={draft.recipeSlug}
          versionNo={draft.versionNo}
          compileStatus={draft.compileStatus}
        />
      )}
    </section>
  );
}

interface EditorTabsProps {
  tab: EditorTab;
  onChange: (next: EditorTab) => void;
  t: (k: string) => string;
}

function EditorTabs({ tab, onChange, t }: EditorTabsProps): ReactElement {
  return (
    <div role="tablist" className="flex gap-2 border-b">
      {(['editor', 'renderer'] as const).map((key) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={tab === key}
          className={`px-3 py-1 text-sm ${tab === key ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
          onClick={() => onChange(key)}
          data-testid={`inspector-editor-tab-${key}`}
        >
          {t(`inbox.inspector.editor.tab.${key}`)}
        </button>
      ))}
    </div>
  );
}

interface EditorTabBodyProps {
  draft: InspectorDraftView;
  body: string;
  onChange: (next: string) => void;
  isReadOnly: boolean;
  onSaved: () => void;
  pendingCursor?: { line: number; col: number; nonce: number };
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function EditorTab(props: EditorTabBodyProps): ReactElement {
  const { draft, body, onChange, isReadOnly, onSaved, pendingCursor, t } = props;
  const saveMutation = trpc.food.recipes.saveDraft.useMutation({
    onSuccess: (res) => {
      if (res.compile.ok) toast.success(t('inbox.inspector.editor.savedOk'));
      else toast.error(t('inbox.inspector.editor.savedFailed'));
      onSaved();
    },
    onError: (err) => toast.error(t('inbox.inspector.editor.saveError', { message: err.message })),
  });
  return (
    <div className="space-y-2">
      <DslEditor
        initialValue={draft.bodyDsl}
        onChange={onChange}
        readOnly={isReadOnly}
        pendingCursor={pendingCursor}
      />
      <CompileStatusRow draft={draft} t={t} />
      {!isReadOnly && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => saveMutation.mutate({ versionId: draft.versionId, dsl: body })}
            disabled={saveMutation.isPending || body === draft.bodyDsl}
            data-testid="inspector-editor-save"
          >
            {saveMutation.isPending
              ? t('inbox.inspector.editor.saving')
              : t('inbox.inspector.editor.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

interface CompileStatusRowProps {
  draft: InspectorDraftView;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function CompileStatusRow({ draft, t }: CompileStatusRowProps): ReactElement {
  const compiledAtLabel = draft.compiledAt ?? t('inbox.inspector.editor.neverCompiled');
  return (
    <p className="text-xs text-muted-foreground" data-testid="inspector-editor-compile-status">
      {t('inbox.inspector.editor.statusRow', {
        status: t(`inbox.inspector.editor.compileStatus.${draft.compileStatus}`),
        compiledAt: compiledAtLabel,
        errorCount: draft.compileError?.errorCount ?? 0,
      })}
    </p>
  );
}
