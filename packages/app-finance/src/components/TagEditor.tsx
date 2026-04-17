import { useEffect, useRef, useState } from 'react';

/**
 * TagEditor — inline popover for editing transaction tags.
 * Shows current tags as removable chips, with autocomplete from known tags
 * and a "Suggest" button backed by an async callback.
 *
 * This component is tRPC-agnostic — callers wire up the API.
 */
import { Badge, Button, Chip, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { cn } from '../lib/utils';

/** Source attribution for a tag — from AI, correction rule, or entity defaults. */
export type TagSource = 'ai' | 'rule' | 'entity';

export interface TagMetaEntry {
  source: TagSource;
  /** For rule-sourced tags: the description_pattern from the matched correction. */
  pattern?: string;
}

export interface TagEditorProps {
  /** Current tags on the transaction. */
  currentTags: string[];
  /** Called with the final tag list when the user saves. May be async. */
  onSave: (tags: string[]) => void | Promise<void>;
  /** Optional async callback for AI-powered tag suggestions. */
  onSuggest?: () => Promise<string[]>;
  /**
   * Available tags for autocomplete — sourced dynamically from the
   * transactions.availableTags endpoint (Notion Tags multi_select options).
   * Users may still type any free-form string not in this list.
   */
  availableTags?: string[];
  /** Whether to disable editing (shows tags read-only). */
  disabled?: boolean;
  /**
   * Optional source attribution metadata keyed by tag name.
   * When provided, source icons and pattern tooltips are shown in the trigger button.
   */
  tagMeta?: Map<string, TagMetaEntry>;
}

/**
 * Inline tag editor that opens as a popover.
 *
 * @example
 * ```tsx
 * <TagEditor
 *   currentTags={["Groceries"]}
 *   onSave={async (tags) => { await updateTransaction({ tags }) }}
 *   onSuggest={async () => suggestTags(description, entityId)}
 * />
 * ```
 */
const SOURCE_ICONS: Record<TagSource, string> = {
  ai: '🤖',
  rule: '📋',
  entity: '🏪',
};

/**
 * Deterministic tag coloring based on string hash.
 * Uses OKLCH for perceptually uniform colors that look good in dark mode.
 */
function getTagStyle(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  // Soft tinted background with high-contrast text for dark mode
  return {
    backgroundColor: `oklch(0.3 0.08 ${hue} / 0.4)`,
    color: `oklch(0.85 0.06 ${hue})`,
    borderColor: `oklch(0.85 0.06 ${hue} / 0.2)`,
  };
}

export function TagEditor({
  currentTags,
  onSave,
  onSuggest,
  availableTags = [],
  disabled = false,
  tagMeta,
}: TagEditorProps) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(currentTags);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allKnownTags = availableTags;

  // Reset local tags when prop changes (e.g. after successful external update)
  useEffect(() => {
    setTags(currentTags);
  }, [currentTags]);

  const filteredSuggestions = (() => {
    if (inputValue === '') {
      return allKnownTags.filter((tag) => !tags.includes(tag));
    }
    const lower = inputValue.toLowerCase();
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const tag of allKnownTags) {
      if (tags.includes(tag)) continue;
      const tagLower = tag.toLowerCase();
      if (tagLower.startsWith(lower)) startsWith.push(tag);
      else if (tagLower.includes(lower)) contains.push(tag);
    }
    return [...startsWith, ...contains];
  })();

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setInputValue('');
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && filteredSuggestions.length > 0) {
      e.preventDefault();
      const first = filteredSuggestions[0];
      if (first) addTag(first);
      return;
    }
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
      return;
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      const last = tags[tags.length - 1];
      if (last) removeTag(last);
      return;
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(tags);
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSuggest() {
    if (!onSuggest) return;
    setIsSuggesting(true);
    try {
      const suggested = await onSuggest();
      const newTags = suggested.filter((t) => !tags.includes(t));
      setTags((prev) => [...prev, ...newTags]);
    } finally {
      setIsSuggesting(false);
    }
  }

  function handleCancel() {
    setTags(currentTags);
    setInputValue('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'flex flex-wrap gap-1 min-h-10 text-left w-full rounded px-2 py-1.5 transition-colors items-center h-auto',
            disabled ? 'cursor-default' : 'hover:bg-accent/50 cursor-pointer'
          )}
          aria-label="Edit tags"
          disabled={disabled}
        >
          {tags.length === 0 ? (
            <span className="text-muted-foreground text-xs">—</span>
          ) : (
            tags.slice(0, 3).map((tag) => {
              const meta = tagMeta?.get(tag);
              const tooltipText =
                meta?.source === 'rule' && meta?.pattern
                  ? `Rule: "${meta.pattern}"`
                  : meta?.source
                    ? `${meta.source} suggestion`
                    : undefined;
              const style = getTagStyle(tag);
              return (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-2xs uppercase tracking-wider font-bold py-0 px-1.5"
                  style={style}
                  title={tooltipText}
                >
                  {meta ? `${SOURCE_ICONS[meta.source]} ` : ''}
                  {tag}
                </Badge>
              );
            })
          )}
          {tags.length > 3 && (
            <Badge variant="secondary" className="text-2xs py-0 px-1.5 font-normal opacity-70">
              +{tags.length - 3}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <p className="text-sm font-medium">Edit tags</p>

          {/* Current tags as removable chips */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const style = getTagStyle(tag);
                return (
                  <Chip
                    key={tag}
                    size="sm"
                    removable
                    onRemove={() => removeTag(tag)}
                    style={style}
                    className="border"
                  >
                    {tag}
                  </Chip>
                );
              })}
            </div>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to add a tag…"
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />

          {/* Autocomplete suggestions */}
          {filteredSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filteredSuggestions.slice(0, 8).map((tag) => {
                const style = getTagStyle(tag);
                return (
                  <Button
                    key={tag}
                    variant="outline"
                    size="sm"
                    onClick={() => addTag(tag)}
                    className="text-xs px-3 py-2 rounded-full h-auto hover:brightness-110"
                    style={style}
                  >
                    + {tag}
                  </Button>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {onSuggest ? (
              <Button
                variant="link"
                size="sm"
                onClick={handleSuggest}
                disabled={isSuggesting}
                className="text-xs text-muted-foreground hover:text-foreground px-0 h-auto"
              >
                {isSuggesting ? 'Suggesting…' : 'Suggest'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="text-xs px-3 h-auto py-2"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs px-3 h-auto py-2"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
