/**
 * `useReorderController` — bridges the React panel state with the
 * imperative CodeMirror view.
 *
 * Responsibilities:
 *
 *   1. On open, snapshot the current declarations by scanning the live
 *      editor document. The snapshot drives the panel's row list.
 *   2. On apply, build a renumber plan against the same source, dispatch
 *      it as a single CodeMirror transaction (single undo step), and
 *      close the dialog.
 *
 * The hook deliberately does NOT debounce, persist, or re-scan as the
 * user moves rows — the snapshot is frozen for the lifetime of the open
 * dialog. If the underlying document changed between open and apply, we
 * re-check by rescanning at apply-time and bail out with a no-op if the
 * structure changed underneath us.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { buildRenumberPlan, scanIngredientUsages } from '../../dsl/renumber';

import type { EditorView } from '@codemirror/view';

import type { IngredientDeclaration } from '../../dsl/renumber';

export interface ReorderController {
  readonly open: boolean;
  readonly setOpen: (next: boolean) => void;
  readonly declarations: readonly IngredientDeclaration[];
  readonly apply: (permutation: readonly number[]) => void;
}

export interface UseReorderControllerOptions {
  readonly getView: () => EditorView | null;
}

export function useReorderController(options: UseReorderControllerOptions): ReorderController {
  const [open, setOpenState] = useState(false);
  const snapshotRef = useRef<readonly IngredientDeclaration[]>([]);
  const [snapshot, setSnapshot] = useState<readonly IngredientDeclaration[]>([]);

  const setOpen = useCallback(
    (next: boolean): void => {
      if (next) {
        const view = options.getView();
        const scan = view === null ? null : scanIngredientUsages(view.state.doc.toString());
        const decls = scan?.declarations ?? [];
        snapshotRef.current = decls;
        setSnapshot(decls);
      }
      setOpenState(next);
    },
    [options]
  );

  const apply = useCallback(
    (permutation: readonly number[]): void => {
      const view = options.getView();
      if (view === null) {
        setOpenState(false);
        return;
      }
      try {
        const source = view.state.doc.toString();
        const scan = scanIngredientUsages(source);
        if (!structuralMatch(scan.declarations, snapshotRef.current)) {
          setOpenState(false);
          return;
        }
        const plan = buildRenumberPlan(source, permutation, scan);
        if (plan.changes.length > 0) {
          view.dispatch({
            changes: plan.changes.map((c) => ({ from: c.from, to: c.to, insert: c.insert })),
          });
        }
      } catch (err) {
        // buildRenumberPlan throws RenumberPermutationError on a malformed
        // permutation or on overlapping changes (a half-typed document the
        // structural-match check didn't catch). The dialog state is the
        // only thing the user sees — close it rather than wedge the UI.
        // The doc is unchanged because the throw happens before dispatch.
        console.warn('reorder apply failed:', err);
      }
      setOpenState(false);
    },
    [options]
  );

  return useMemo(
    () => ({ open, setOpen, declarations: snapshot, apply }),
    [open, setOpen, snapshot, apply]
  );
}

function structuralMatch(
  current: readonly IngredientDeclaration[],
  snapshot: readonly IngredientDeclaration[]
): boolean {
  if (current.length !== snapshot.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    const a = current[i];
    const b = snapshot[i];
    if (a === undefined || b === undefined) return false;
    if (a.currentIndex !== b.currentIndex || a.label !== b.label) return false;
  }
  return true;
}
