import { Button, Textarea } from '@pops/ui';

interface NotesEditorProps {
  draft: string;
  setDraft: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSave: () => void;
  handleCancel: () => void;
  isUpdating: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  title: string;
  updateError: string | null;
}

export function NotesEditor({
  draft,
  setDraft,
  handleKeyDown,
  handleSave,
  handleCancel,
  isUpdating,
  textareaRef,
  title,
  updateError,
}: NotesEditorProps) {
  return (
    <div className="mt-1.5 space-y-1">
      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a note..."
        rows={2}
        maxLength={500}
        aria-label={`Notes for ${title}`}
        className="text-xs min-h-0 resize-none"
      />
      <div className="flex items-center gap-2">
        <Button
          variant="link"
          size="sm"
          onClick={handleSave}
          disabled={isUpdating}
          aria-label="Save note"
          className="text-xs text-primary"
        >
          {isUpdating ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="link"
          size="sm"
          onClick={handleCancel}
          disabled={isUpdating}
          aria-label="Cancel editing"
          className="text-xs text-muted-foreground"
        >
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {draft.length}/500 · Ctrl+Enter to save
        </span>
      </div>
      {updateError && <p className="text-xs text-destructive">{updateError}</p>}
    </div>
  );
}

export function NotesView({
  notes,
  title,
  onClickEdit,
}: {
  notes: string | null;
  title: string;
  onClickEdit: () => void;
}) {
  if (notes) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClickEdit}
        aria-label={`Edit notes for ${title}`}
        className="mt-1.5 text-xs text-muted-foreground line-clamp-2 text-left hover:text-foreground justify-start"
      >
        {notes}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClickEdit}
      aria-label={`Add notes for ${title}`}
      className="mt-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground"
    >
      Add note...
    </Button>
  );
}
