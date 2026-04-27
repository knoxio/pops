/**
 * ScopePicker — scope selection with autocomplete from known scopes
 * and manual entry for new scopes.
 */
import { useCallback, useMemo, useState } from 'react';

import { Chip } from '@pops/ui';

interface ScopePickerProps {
  value: string[];
  suggestions: { label: string; value: string; description?: string }[];
  loading: boolean;
  onChange: (scopes: string[]) => void;
}

/** Normalise a raw scope input: lowercase, trim, replace spaces with hyphens. */
function normaliseInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function ScopeChips({ scopes, onRemove }: { scopes: string[]; onRemove: (i: number) => void }) {
  return (
    <>
      {scopes.map((scope, i) => (
        <Chip key={scope} size="sm" removable onRemove={() => onRemove(i)}>
          {scope}
        </Chip>
      ))}
    </>
  );
}

function ScopeDropdown({
  items,
  onSelect,
}: {
  items: { label: string; value: string; description?: string }[];
  onSelect: (value: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-48 overflow-auto">
      {items.map((s) => (
        <button
          key={s.value}
          type="button"
          className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between"
          onClick={() => onSelect(s.value)}
        >
          <span>{s.label}</span>
          {s.description && <span className="text-xs text-muted-foreground">{s.description}</span>}
        </button>
      ))}
    </div>
  );
}

function getPlaceholder(loading: boolean, hasScopes: boolean): string {
  if (loading) return 'Loading scopes…';
  if (!hasScopes) return 'Add scopes (type or select)…';
  return 'Add more…';
}

function useScopePickerState(
  value: string[],
  suggestions: { label: string; value: string; description?: string }[],
  onChange: (scopes: string[]) => void
) {
  const [inputValue, setInputValue] = useState('');

  const filteredSuggestions = useMemo(() => {
    if (!inputValue) return suggestions;
    const lower = inputValue.toLowerCase();
    return suggestions.filter(
      (s) => s.label.toLowerCase().includes(lower) && !value.includes(s.value)
    );
  }, [inputValue, suggestions, value]);

  const addScope = useCallback(
    (scope: string) => {
      const normalised = normaliseInput(scope);
      if (normalised && !value.includes(normalised)) onChange([...value, normalised]);
      setInputValue('');
    },
    [value, onChange]
  );

  const removeScope = useCallback(
    (index: number) => onChange(value.filter((_, i) => i !== index)),
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
        e.preventDefault();
        if (inputValue.trim()) addScope(inputValue);
      }
      if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeScope(value.length - 1);
      }
    },
    [inputValue, value, addScope, removeScope]
  );

  return { inputValue, setInputValue, filteredSuggestions, addScope, removeScope, handleKeyDown };
}

export function ScopePicker({ value, suggestions, loading, onChange }: ScopePickerProps) {
  const state = useScopePickerState(value, suggestions, onChange);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Scopes
      </label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 border border-border rounded-md bg-background p-2 min-h-11 focus-within:ring-2 focus-within:ring-ring">
          <ScopeChips scopes={value} onRemove={state.removeScope} />
          <input
            type="text"
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground min-w-[120px]"
            value={state.inputValue}
            onChange={(e) => state.setInputValue(e.target.value)}
            onKeyDown={state.handleKeyDown}
            placeholder={getPlaceholder(loading, value.length > 0)}
            disabled={loading}
            aria-label="Scope input"
          />
        </div>
        {state.inputValue && (
          <ScopeDropdown items={state.filteredSuggestions} onSelect={state.addScope} />
        )}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground ml-1">
          Leave empty to infer scopes automatically on submit.
        </p>
      )}
    </div>
  );
}
