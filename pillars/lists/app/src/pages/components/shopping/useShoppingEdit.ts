import { useState } from 'react';

import type { ListItemRow } from '../../detail/types.js';

/**
 * Inline-edit state for a shopping row's label. Mirrors the generic
 * `ListItemRow`'s inline editor: click → editor visible, Enter commits,
 * Esc cancels, blur commits.
 */
export interface ShoppingEdit {
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  begin: () => void;
  cancel: () => void;
  commit: () => Promise<void>;
}

export function useShoppingEdit(
  row: ListItemRow,
  onSave: (id: number, label: string) => Promise<boolean>
): ShoppingEdit {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.label);
  const begin = () => {
    setDraft(row.label);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === row.label) {
      setEditing(false);
      return;
    }
    const ok = await onSave(row.id, trimmed);
    if (ok) setEditing(false);
  };
  return { editing, draft, setDraft, begin, cancel, commit };
}
