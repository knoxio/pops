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
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { usePillarMutation } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import { DslEditor } from '../../../components/DslEditor.js';
import { InspectorRenderer } from './InspectorRenderer.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';
import type { InspectorDraftView } from '@pops/app-food-db';

type SaveDraftInput = inferRouterInputs<AppRouter>['food']['recipes']['saveDraft'];
type SaveDraftOutput = inferRouterOutputs<AppRouter>['food']['recipes']['saveDraft'];

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
  // Re-sync `body` whenever the inspector query produces a fresh
  // `draft.bodyDsl` (Save → invalidate, sibling-tab approve, etc.) — without
  // this, a stale `body` could overwrite the on-server DSL on the next Save.
  // The `lastSyncedDsl` ref prevents the user's in-flight unsaved edits from
  // being clobbered by a refetch that returned the same value they last
  // saved (Copilot R1).
  const lastSyncedDsl = useRef(draft.bodyDsl);
  useEffect(() => {
    if (draft.bodyDsl === lastSyncedDsl.current) return;
    lastSyncedDsl.current = draft.bodyDsl;
    setBody(draft.bodyDsl);
  }, [draft.bodyDsl]);
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
  const saveMutation = usePillarMutation<SaveDraftInput, SaveDraftOutput>(
    'food',
    ['recipes', 'saveDraft'],
    {
      onSuccess: (res) => {
        if (res.compile.ok) toast.success(t('inbox.inspector.editor.savedOk'));
        else toast.error(t('inbox.inspector.editor.savedFailed'));
        onSaved();
      },
      onError: (err) =>
        toast.error(t('inbox.inspector.editor.saveError', { message: err.message })),
    }
  );
  return (
    <div className="space-y-2">
      <DslEditor
        initialValue={body}
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
