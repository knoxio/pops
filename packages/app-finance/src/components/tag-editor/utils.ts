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
  /** Available tags for autocomplete. */
  availableTags?: string[];
  /** Whether to disable editing (shows tags read-only). */
  disabled?: boolean;
  /** Optional source attribution metadata keyed by tag name. */
  tagMeta?: Map<string, TagMetaEntry>;
}

export function filterTagSuggestions(
  inputValue: string,
  availableTags: string[],
  selectedTags: string[]
): string[] {
  if (inputValue === '') {
    return availableTags.filter((tag) => !selectedTags.includes(tag));
  }
  const lower = inputValue.toLowerCase();
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const tag of availableTags) {
    if (selectedTags.includes(tag)) continue;
    const tagLower = tag.toLowerCase();
    if (tagLower.startsWith(lower)) startsWith.push(tag);
    else if (tagLower.includes(lower)) contains.push(tag);
  }
  return [...startsWith, ...contains];
}
