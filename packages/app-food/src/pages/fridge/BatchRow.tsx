/**
 * Single batch row in the fridge sectioned list — PRD-147.
 *
 * Renders the variant / prep / qty / expiry line with a kebab menu
 * exposing Edit / Relocate / Adjust / Cook / Delete. The page owns
 * which modal is open; this component only reports the chosen action.
 */
import { AlertTriangle, CircleAlert, MoreVertical } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { formatExpiry, formatQty, urgencyFor } from './format.js';

import type { ReactElement } from 'react';

import type { FridgeViewResponses } from '../../food-api/types.gen.js';

type FridgeBatchRowData =
  FridgeViewResponses[200]['sections'][number]['ingredients'][number]['batches'][number];

export type BatchAction = 'edit' | 'relocate' | 'adjust' | 'cook' | 'delete';

export interface BatchRowProps {
  batch: FridgeBatchRowData;
  ingredientName: string;
  onAction: (action: BatchAction, batchId: number) => void;
}

export function BatchRow({ batch, ingredientName, onAction }: BatchRowProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const urgency = urgencyFor(batch.daysToExpiry);
  const label = describeBatch(batch, ingredientName);
  const isDeleted = batch.deletedAt !== null;
  const isEmpty = batch.qtyRemaining === 0 && !isDeleted;

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm ${
        isDeleted ? 'opacity-50' : ''
      }`}
      data-batch-id={batch.id}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ExpiryIcon urgency={urgency} />
        <div className="min-w-0">
          <div className="truncate font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">
            {formatQty(batch.qtyRemaining, batch.unit)} ·{' '}
            {formatExpiry(batch.expiresAt, batch.daysToExpiry)}
            {isEmpty && ' · empty'}
            {isDeleted && ' · deleted'}
            {batch.sourceType === 'recipe_run' && batch.sourceRecipeSlug !== null && (
              <> · from {batch.sourceRecipeSlug}</>
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          disabled={isDeleted}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </Button>
        {menuOpen && (
          <ActionMenu
            onAction={(a) => {
              setMenuOpen(false);
              onAction(a, batch.id);
            }}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </li>
  );
}

function describeBatch(batch: FridgeBatchRowData, ingredientName: string): string {
  const parts = [ingredientName];
  if (batch.variantName !== null && batch.variantName.length > 0) parts.push(batch.variantName);
  if (batch.prepStateLabel !== null && batch.prepStateLabel.length > 0)
    parts.push(batch.prepStateLabel);
  return parts.join(' / ');
}

function ExpiryIcon({ urgency }: { urgency: ReturnType<typeof urgencyFor> }): ReactElement {
  if (urgency === 'expired') {
    return <CircleAlert className="size-4 text-destructive" aria-label="Expired" />;
  }
  if (urgency === 'soon') {
    return <AlertTriangle className="size-4 text-warning" aria-label="Expiring soon" />;
  }
  return <span aria-hidden="true" className="inline-block w-4" />;
}

interface ActionMenuProps {
  onAction: (action: BatchAction) => void;
  onClose: () => void;
}

function ActionMenu({ onAction, onClose }: ActionMenuProps): ReactElement {
  const actions: { id: BatchAction; label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'relocate', label: 'Relocate' },
    { id: 'adjust', label: 'Adjust qty' },
    { id: 'cook', label: 'Cook now' },
    { id: 'delete', label: 'Delete' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <ul
        role="menu"
        className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border bg-popover shadow-md"
      >
        {actions.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => onAction(a.id)}
            >
              {a.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
