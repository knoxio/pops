/**
 * Pure-presentational dialog for the "Reorder ingredients" affordance —
 * PRD-120 part E.
 *
 * The dialog takes the current list of `@ingredient` declarations (from
 * the renumber scanner), surfaces up/down buttons for each row, and
 * fires `onApply(permutation)` when the user confirms. State for the
 * pending order lives here; persistence lives in the controller hook
 * that owns the CodeMirror view (`useReorderController`).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import type { IngredientDeclaration } from '../../dsl/renumber';

export interface ReorderIngredientsPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly declarations: readonly IngredientDeclaration[];
  readonly onApply: (permutation: readonly number[]) => void;
}

export function ReorderIngredientsPanel(props: ReorderIngredientsPanelProps) {
  const { t } = useTranslation('food');
  const [order, setOrder] = useState<readonly number[]>(() => identity(props.declarations.length));

  useEffect(() => {
    if (props.open) setOrder(identity(props.declarations.length));
  }, [props.open, props.declarations.length]);

  const move = (slot: number, delta: number): void => {
    const target = slot + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const tmp = next[slot] ?? 0;
    next[slot] = next[target] ?? 0;
    next[target] = tmp;
    setOrder(next);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent data-testid="dsl-editor-reorder-panel">
        <DialogHeader>
          <DialogTitle>{t('editor.reorder.title')}</DialogTitle>
          <DialogDescription>{t('editor.reorder.description')}</DialogDescription>
        </DialogHeader>
        <ReorderList
          order={order}
          declarations={props.declarations}
          moveLabel={{ up: t('editor.reorder.moveUp'), down: t('editor.reorder.moveDown') }}
          onMove={move}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            data-testid="dsl-editor-reorder-cancel"
          >
            {t('editor.reorder.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => props.onApply(order)}
            disabled={order.length === 0 || isIdentity(order)}
            data-testid="dsl-editor-reorder-apply"
          >
            {t('editor.reorder.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReorderListProps {
  readonly order: readonly number[];
  readonly declarations: readonly IngredientDeclaration[];
  readonly moveLabel: { up: string; down: string };
  readonly onMove: (slot: number, delta: number) => void;
}

function ReorderList(props: ReorderListProps) {
  const { t } = useTranslation('food');
  if (props.order.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="dsl-editor-reorder-empty">
        {t('editor.reorder.empty')}
      </p>
    );
  }
  return (
    <ol
      className="flex flex-col gap-2"
      aria-label={t('editor.reorder.listAriaLabel')}
      data-testid="dsl-editor-reorder-list"
    >
      {props.order.map((declIdx, slot) => {
        const decl = props.declarations[declIdx];
        if (decl === undefined) return null;
        return (
          <ReorderRow
            key={`${decl.declarationIndex}-${decl.blockStart}`}
            slot={slot}
            label={decl.label ?? t('editor.reorder.unnamed')}
            newIndex={slot + 1}
            disableUp={slot === 0}
            disableDown={slot === props.order.length - 1}
            moveLabel={props.moveLabel}
            onMove={props.onMove}
          />
        );
      })}
    </ol>
  );
}

interface ReorderRowProps {
  readonly slot: number;
  readonly label: string;
  readonly newIndex: number;
  readonly disableUp: boolean;
  readonly disableDown: boolean;
  readonly moveLabel: { up: string; down: string };
  readonly onMove: (slot: number, delta: number) => void;
}

function ReorderRow(props: ReorderRowProps) {
  return (
    <li
      className="flex items-center gap-2 rounded border px-3 py-2"
      data-testid={`dsl-editor-reorder-row-${props.slot}`}
    >
      <span className="text-muted-foreground w-6 text-right font-mono text-sm tabular-nums">
        {props.newIndex}.
      </span>
      <span className="flex-1 font-mono text-sm">{props.label}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={props.moveLabel.up}
        disabled={props.disableUp}
        onClick={() => props.onMove(props.slot, -1)}
        data-testid={`dsl-editor-reorder-up-${props.slot}`}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={props.moveLabel.down}
        disabled={props.disableDown}
        onClick={() => props.onMove(props.slot, 1)}
        data-testid={`dsl-editor-reorder-down-${props.slot}`}
      >
        ↓
      </Button>
    </li>
  );
}

function identity(n: number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(i);
  return out;
}

function isIdentity(order: readonly number[]): boolean {
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== i) return false;
  }
  return true;
}
