import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@pops/ui';

import { cn } from '../../../lib/utils';

export interface GroupTagBarProps {
  stagedTags: string[];
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onApply: () => void;
}

/**
 * Compact inline bar for staging tags to apply to an entire group.
 * Shows a tag picker (filtered from availableTags) and an Apply button.
 * Apply merges staged tags into all transactions in the group — never replaces.
 */
export function GroupTagBar({
  stagedTags,
  availableTags,
  onAddTag,
  onRemoveTag,
  onApply,
}: GroupTagBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = (() => {
    if (inputValue === '') {
      return availableTags.filter((t) => !stagedTags.includes(t));
    }
    const lower = inputValue.toLowerCase();
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const t of availableTags) {
      if (stagedTags.includes(t)) continue;
      const tLower = t.toLowerCase();
      if (tLower.startsWith(lower)) startsWith.push(t);
      else if (tLower.includes(lower)) contains.push(t);
    }
    return [...startsWith, ...contains];
  })();

  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setInputValue('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  const handleAddFromInput = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAddTag(trimmed);
      setInputValue('');
    }
  };

  return (
    <div className="px-4 py-2 border-b bg-muted/10 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">Apply to group:</span>

      {stagedTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-background border border-border rounded-full"
        >
          {tag}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveTag(tag)}
            className="text-muted-foreground hover:text-foreground ml-0.5 h-4 w-4 p-0"
            aria-label={`Remove ${tag}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </span>
      ))}

      <div ref={containerRef} className="relative">
        <input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowPicker(true);
          }}
          onFocus={() => {
            setShowPicker(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && filtered.length > 0) {
              e.preventDefault();
              const first = filtered[0];
              if (first) onAddTag(first);
              setShowPicker(false);
              setInputValue('');
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const exactMatch = filtered.find((t) => t.toLowerCase() === inputValue.toLowerCase());
              if (exactMatch) {
                onAddTag(exactMatch);
              } else if (inputValue.trim()) {
                handleAddFromInput();
              }
              setShowPicker(false);
              setInputValue('');
            } else if (e.key === 'Escape') {
              setShowPicker(false);
              setInputValue('');
            }
          }}
          placeholder="+ Add tag…"
          className="text-xs border border-dashed border-border rounded-full px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring w-24"
        />

        {showPicker && filtered.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-32 max-h-40 overflow-y-auto">
            {filtered.slice(0, 10).map((tag) => (
              <button
                key={tag}
                className="w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAddTag(tag);
                  setShowPicker(false);
                  setInputValue('');
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onApply}
        disabled={stagedTags.length === 0}
        className={cn(
          'px-2 py-0.5 h-auto text-xs whitespace-nowrap',
          stagedTags.length > 0 && 'border-primary text-primary hover:bg-primary/10'
        )}
      >
        Merge into all
      </Button>
    </div>
  );
}
