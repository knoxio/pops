import { useEffect, useRef, useState } from 'react';

interface Args {
  notes: string | null;
  isUpdating: boolean;
  updateError: string | null;
  entryId: number;
  onUpdateNotes: (id: number, notes: string | null) => void;
}

export function useWatchlistItemNotes({
  notes,
  isUpdating,
  updateError,
  entryId,
  onUpdateNotes,
}: Args) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const savePending = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(notes ?? '');
  }, [notes, editing]);

  useEffect(() => {
    if (savePending.current && !isUpdating) {
      savePending.current = false;
      if (!updateError) setEditing(false);
    }
  }, [isUpdating, updateError]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    savePending.current = true;
    onUpdateNotes(entryId, trimmed || null);
  };

  const handleCancel = () => {
    setDraft(notes ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape' && !isUpdating) {
      handleCancel();
    }
  };

  return {
    editing,
    setEditing,
    draft,
    setDraft,
    textareaRef,
    handleSave,
    handleCancel,
    handleKeyDown,
  };
}
