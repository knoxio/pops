import { Button, Chip, hashToColor } from '@pops/ui';

interface PanelProps {
  tags: string[];
  inputValue: string;
  filtered: string[];
  isSaving: boolean;
  isSuggesting: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setInputValue: (v: string) => void;
  onSave: () => void;
  onSuggest?: () => void;
  onCancel: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function CurrentTags({ tags, onRemove }: { tags: string[]; onRemove: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Chip
          key={tag}
          size="sm"
          removable
          onRemove={() => onRemove(tag)}
          style={hashToColor(tag)}
          className="border"
        >
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function Suggestions({
  filtered,
  onAddTag,
}: {
  filtered: string[];
  onAddTag: (tag: string) => void;
}) {
  if (filtered.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {filtered.slice(0, 8).map((tag) => (
        <Button
          key={tag}
          variant="outline"
          size="sm"
          onClick={() => onAddTag(tag)}
          className="text-xs px-3 py-2 rounded-full h-auto hover:brightness-110"
          style={hashToColor(tag)}
        >
          + {tag}
        </Button>
      ))}
    </div>
  );
}

function PanelActions({
  isSaving,
  isSuggesting,
  onSave,
  onSuggest,
  onCancel,
}: {
  isSaving: boolean;
  isSuggesting: boolean;
  onSave: () => void;
  onSuggest?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      {onSuggest ? (
        <Button
          variant="link"
          size="sm"
          onClick={onSuggest}
          disabled={isSuggesting}
          className="text-xs text-muted-foreground hover:text-foreground px-0 h-auto"
        >
          {isSuggesting ? 'Suggesting…' : 'Suggest'}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="text-xs px-3 h-auto py-2">
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving} className="text-xs px-3 h-auto py-2">
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function TagEditorPanel(props: PanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Edit tags</p>
      <CurrentTags tags={props.tags} onRemove={props.onRemoveTag} />
      <input
        ref={props.inputRef}
        type="text"
        value={props.inputValue}
        onChange={(e) => props.setInputValue(e.target.value)}
        onKeyDown={props.onKeyDown}
        placeholder="Type to add a tag…"
        className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        autoFocus
      />
      <Suggestions filtered={props.filtered} onAddTag={props.onAddTag} />
      <PanelActions
        isSaving={props.isSaving}
        isSuggesting={props.isSuggesting}
        onSave={props.onSave}
        onSuggest={props.onSuggest}
        onCancel={props.onCancel}
      />
    </div>
  );
}
