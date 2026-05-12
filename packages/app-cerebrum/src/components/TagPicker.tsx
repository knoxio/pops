/**
 * TagPicker — multi-tag input with prefix-based autocomplete from
 * existing tags in the index (PRD-081 US-01 AC #9).
 *
 * Mirrors ScopePicker's interaction model so the form keeps a
 * consistent feel: type to filter known tags, Enter/comma/Tab to commit,
 * Backspace at empty input removes the last chip.
 */
import { useCallback, useMemo, useState } from 'react';

import { Chip } from '@pops/ui';

interface TagPickerProps {
  value: string[];
  suggestions: { tag: string; count: number }[];
  loading?: boolean;
  onChange: (tags: string[]) => void;
}

const MAX_DROPDOWN_ITEMS = 8;

/** Normalise a raw tag input: trim, lowercase, replace whitespace with `-`. */
function normaliseInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function TagChips({ tags, onRemove }: { tags: string[]; onRemove: (i: number) => void }) {
  return (
    <>
      {tags.map((tag, i) => (
        <Chip key={tag} size="sm" removable onRemove={() => onRemove(i)}>
          {tag}
        </Chip>
      ))}
    </>
  );
}

function TagDropdown({
  items,
  onSelect,
}: {
  items: { tag: string; count: number }[];
  onSelect: (tag: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-48 overflow-auto">
      {items.map((item) => (
        <button
          key={item.tag}
          type="button"
          className="w-full min-h-11 px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between"
          onClick={() => onSelect(item.tag)}
        >
          <span>{item.tag}</span>
          <span className="text-xs text-muted-foreground">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

function useTagPickerState(
  value: string[],
  suggestions: { tag: string; count: number }[],
  onChange: (tags: string[]) => void
) {
  const [inputValue, setInputValue] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  const filteredSuggestions = useMemo(() => {
    const lower = inputValue.trim().toLowerCase();
    const filtered = suggestions.filter((s) => !selected.has(s.tag));
    if (!lower) return filtered.slice(0, MAX_DROPDOWN_ITEMS);
    return filtered.filter((s) => s.tag.startsWith(lower)).slice(0, MAX_DROPDOWN_ITEMS);
  }, [inputValue, suggestions, selected]);

  const addTag = useCallback(
    (raw: string) => {
      const normalised = normaliseInput(raw);
      if (!normalised || selected.has(normalised)) {
        setInputValue('');
        return;
      }
      onChange([...value, normalised]);
      setInputValue('');
    },
    [value, onChange, selected]
  );

  const removeTag = useCallback(
    (index: number) => onChange(value.filter((_, i) => i !== index)),
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
        if (inputValue.trim()) {
          e.preventDefault();
          addTag(inputValue);
        }
        return;
      }
      if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeTag(value.length - 1);
      }
    },
    [inputValue, value, addTag, removeTag]
  );

  return { inputValue, setInputValue, filteredSuggestions, addTag, removeTag, handleKeyDown };
}

export function TagPicker({ value, suggestions, loading = false, onChange }: TagPickerProps) {
  const state = useTagPickerState(value, suggestions, onChange);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label
        htmlFor="tag-picker-input"
        className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1"
      >
        Tags
      </label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 border border-border rounded-md bg-background p-2 min-h-11 focus-within:ring-2 focus-within:ring-ring">
          <TagChips tags={value} onRemove={state.removeTag} />
          <input
            id="tag-picker-input"
            type="text"
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground min-w-[120px]"
            value={state.inputValue}
            onChange={(e) => state.setInputValue(e.target.value)}
            onKeyDown={state.handleKeyDown}
            placeholder={loading ? 'Loading tags…' : 'Add tags…'}
            aria-label="Tag input"
            autoComplete="off"
          />
        </div>
        {state.inputValue && (
          <TagDropdown items={state.filteredSuggestions} onSelect={state.addTag} />
        )}
      </div>
    </div>
  );
}
