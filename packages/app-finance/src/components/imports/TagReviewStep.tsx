import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';
import { Button } from '@pops/ui';
import { Badge } from '@pops/ui';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { useImportStore } from '../../store/importStore';
import { TagEditor, type TagMetaEntry } from '../TagEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Group of confirmed transactions sharing the same entity */
interface ConfirmedGroup {
  entityName: string;
  transactions: ConfirmedTransaction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group confirmed transactions by entity name, sorting alphabetically */
function groupByEntity(transactions: ConfirmedTransaction[]): ConfirmedGroup[] {
  const map = new Map<string, ConfirmedTransaction[]>();
  for (const t of transactions) {
    const key = t.entityName ?? 'No Entity';
    const existing = map.get(key);
    if (existing) {
      existing.push(t);
    } else {
      map.set(key, [t]);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entityName, txns]) => ({ entityName, transactions: txns }));
}

/** Union of all distinct tags across an array of tag lists */
function unionTags(tagLists: string[][]): string[] {
  return [...new Set(tagLists.flat())].sort();
}

/** Build a tagMeta Map from a SuggestedTag array for the TagEditor */
function buildTagMetaMap(suggestedTags: SuggestedTag[]): Map<string, TagMetaEntry> {
  const map = new Map<string, TagMetaEntry>();
  for (const s of suggestedTags) {
    map.set(s.tag, { source: s.source, pattern: s.pattern });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Step 5: Tag Review — review and adjust tags before Final Review (no DB write here).
 *
 * Confirmed transactions arrive with tags pre-populated from AI/rule/entity
 * suggestions. This step lets the user accept, modify, or clear tags before
 * the final import is triggered.
 *
 * Features:
 * - All groups expanded by default (including those with no suggestions)
 * - Group-level bulk tag application (merge semantics — never replaces individual edits)
 * - Per-transaction tag editing via TagEditor
 * - Source badges on suggested tags: 🤖 AI, 📋 Rule, 🏪 Entity
 * - Rule pattern shown via tooltip on badge hover
 */
export function TagReviewStep() {
  const { confirmedTransactions, updateTransactionTags, nextStep, prevStep } = useImportStore();

  // Local tag state keyed by checksum — persisted to the store on Continue (still no DB write).
  const [localTags, setLocalTags] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.tags ?? []]))
  );

  useEffect(() => {
    setLocalTags((prev) =>
      Object.fromEntries(
        confirmedTransactions.map((t) => [t.checksum, prev[t.checksum] ?? t.tags ?? []])
      )
    );
  }, [confirmedTransactions]);

  // Immutable snapshot of original suggested tags per checksum — for source badges
  const originalSuggestedTags = useMemo<Record<string, SuggestedTag[]>>(
    () => Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []])),
    [confirmedTransactions]
  );

  const initialTagsRef = useRef<Record<string, string[]> | null>(null);
  if (initialTagsRef.current === null && confirmedTransactions.length > 0) {
    initialTagsRef.current = Object.fromEntries(
      confirmedTransactions.map((t) => [t.checksum, [...(t.tags ?? [])]])
    );
  }

  const groups = useMemo(() => groupByEntity(confirmedTransactions), [confirmedTransactions]);

  const { data: serverTags } = trpc.finance.transactions.availableTags.useQuery();

  // Merge server tags with any tags the user has added locally during this session.
  // This ensures newly typed tags appear as autocomplete suggestions across all rows.
  const availableTags = useMemo(() => {
    const local = Object.values(localTags).flat();
    return [...new Set([...(serverTags ?? []), ...local])].sort();
  }, [serverTags, localTags]);

  const updateTag = useCallback((checksum: string, tags: string[]) => {
    setLocalTags((prev) => ({ ...prev, [checksum]: tags }));
  }, []);

  /** Accept all pre-suggested tags for every transaction (resets to original suggestions). */
  const handleAcceptAll = useCallback(() => {
    const updated: Record<string, string[]> = {};
    for (const t of confirmedTransactions) {
      updated[t.checksum] = t.tags ?? [];
    }
    setLocalTags(updated);
    toast.success('All suggested tags accepted');
  }, [confirmedTransactions]);

  /**
   * Merge a set of tags into every transaction in a group.
   * Never replaces existing tags — only adds tags the transaction doesn't already have.
   */
  const handleApplyGroupTags = useCallback((group: ConfirmedGroup, newTags: string[]) => {
    setLocalTags((prev) => {
      const next = { ...prev };
      for (const t of group.transactions) {
        const existing = prev[t.checksum] ?? [];
        const merged = Array.from(new Set([...existing, ...newTags]));
        next[t.checksum] = merged;
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    for (const [checksum, tags] of Object.entries(localTags)) {
      updateTransactionTags(checksum, tags);
    }
    nextStep();
  }, [localTags, updateTransactionTags, nextStep]);

  const continueLabel =
    confirmedTransactions.length === 1
      ? 'Continue to final review (1 transaction)'
      : `Continue to final review (${confirmedTransactions.length} transactions)`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Tag Review</h2>
        <p className="text-sm text-muted-foreground">
          Review and adjust tags before the final step. Nothing is written to the database until you
          commit on Final Review. Tags are pre-filled from AI suggestions, learned rules, and entity
          defaults.
        </p>
      </div>

      {/* Top-level bulk action */}
      {confirmedTransactions.length > 0 && (
        <Button variant="outline" size="sm" onClick={handleAcceptAll}>
          Accept All Suggestions
        </Button>
      )}

      {/* Entity groups */}
      <div className="space-y-4">
        {groups.map((group) => (
          <EntityGroup
            key={group.entityName}
            group={group}
            localTags={localTags}
            originalSuggestedTags={originalSuggestedTags}
            availableTags={availableTags ?? []}
            onUpdateTag={updateTag}
            onApplyGroupTags={handleApplyGroupTags}
          />
        ))}

        {confirmedTransactions.length === 0 && (
          <p className="text-center py-8 text-muted-foreground text-sm">No transactions to tag.</p>
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex justify-between items-center pt-2">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={confirmedTransactions.length === 0}
          aria-label="Continue to final review"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntityGroup
// ---------------------------------------------------------------------------

interface EntityGroupProps {
  group: ConfirmedGroup;
  localTags: Record<string, string[]>;
  originalSuggestedTags: Record<string, SuggestedTag[]>;
  availableTags: string[];
  onUpdateTag: (checksum: string, tags: string[]) => void;
  onApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
}

/**
 * Collapsible group of transactions sharing an entity.
 * Always starts expanded. Includes a bulk-tag row for applying tags to the
 * whole group (merge semantics — never replaces individually-edited tags).
 */
function EntityGroup({
  group,
  localTags,
  originalSuggestedTags,
  availableTags,
  onUpdateTag,
  onApplyGroupTags,
}: EntityGroupProps) {
  const [expanded, setExpanded] = useState(true);

  // Reactive union of all current tags across this group (updates as user edits)
  const currentTagsPerTx = group.transactions.map((t) => localTags[t.checksum] ?? []);
  const currentUnion = unionTags(currentTagsPerTx);

  // Suggested union from original suggestions (for "apply suggestions to all" button)
  const suggestedUnion = useMemo(() => {
    return unionTags(
      group.transactions.map((t) => (originalSuggestedTags[t.checksum] ?? []).map((s) => s.tag))
    );
  }, [group.transactions, originalSuggestedTags]);

  // Staged tags for group-level bulk application
  const [groupStagedTags, setGroupStagedTags] = useState<string[]>([]);

  const handleApplySuggestions = useCallback(() => {
    if (suggestedUnion.length === 0) return;
    onApplyGroupTags(group, suggestedUnion);
    toast.success(
      `Suggestions merged into ${group.transactions.length} transaction${group.transactions.length !== 1 ? 's' : ''}`
    );
  }, [group, suggestedUnion, onApplyGroupTags]);

  const handleApplyStagedToGroup = useCallback(() => {
    if (groupStagedTags.length === 0) return;
    onApplyGroupTags(group, groupStagedTags);
    toast.success(
      `Tags merged into ${group.transactions.length} transaction${group.transactions.length !== 1 ? 's' : ''}`
    );
    setGroupStagedTags([]);
  }, [group, groupStagedTags, onApplyGroupTags]);

  const removeGroupStagedTag = useCallback((tag: string) => {
    setGroupStagedTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const addGroupStagedTag = useCallback(
    (tag: string) => {
      if (!groupStagedTags.includes(tag)) {
        setGroupStagedTags((prev) => [...prev, tag]);
      }
    },
    [groupStagedTags]
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Group header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
        <Button
          variant="ghost"
          className="flex items-center gap-2 flex-1 text-left h-auto p-0 hover:bg-transparent"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{group.entityName}</span>
          <span className="text-xs text-muted-foreground">({group.transactions.length})</span>
        </Button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Current tag union preview (reactive to edits) */}
          {currentUnion.length > 0 && (
            <div className="hidden sm:flex gap-1 flex-wrap max-w-48">
              {currentUnion.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {currentUnion.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{currentUnion.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Apply original suggestions to all (if any exist) */}
          {suggestedUnion.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplySuggestions}
              className="text-xs px-2 py-1 h-auto whitespace-nowrap"
              title={`Apply suggestions: ${suggestedUnion.join(', ')}`}
            >
              Apply suggestions
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Group-level bulk tag application row */}
          <GroupTagBar
            stagedTags={groupStagedTags}
            availableTags={availableTags}
            onAddTag={addGroupStagedTag}
            onRemoveTag={removeGroupStagedTag}
            onApply={handleApplyStagedToGroup}
          />

          {/* Transaction rows */}
          <div className="divide-y">
            {group.transactions.map((t) => (
              <TransactionTagRow
                key={t.checksum}
                transaction={t}
                tags={localTags[t.checksum] ?? []}
                originalSuggestedTags={originalSuggestedTags[t.checksum] ?? []}
                availableTags={availableTags}
                onSave={(tags) => onUpdateTag(t.checksum, tags)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupTagBar
// ---------------------------------------------------------------------------

interface GroupTagBarProps {
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
function GroupTagBar({
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

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setInputValue('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

      {/* Staged tag chips */}
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

      {/* Tag picker */}
      <div ref={containerRef} className="relative">
        <input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowPicker(true);
          }}
          onFocus={() => setShowPicker(true)}
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
              // If there's an exact match in filtered, pick it; else add free-form
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
                  e.preventDefault(); // prevent input blur
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

      {/* Apply button — disabled when no staged tags */}
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

// ---------------------------------------------------------------------------
// TransactionTagRow
// ---------------------------------------------------------------------------

interface TransactionTagRowProps {
  transaction: ConfirmedTransaction;
  tags: string[];
  originalSuggestedTags: SuggestedTag[];
  availableTags: string[];
  onSave: (tags: string[]) => void;
}

/**
 * Single transaction row with inline tag editor.
 * Tags from suggestions show source badges (🤖 AI, 📋 Rule, 🏪 Entity).
 * Rule-sourced tags include a hover tooltip with the matched description_pattern.
 */
function TransactionTagRow({
  transaction,
  tags,
  originalSuggestedTags,
  availableTags,
  onSave,
}: TransactionTagRowProps) {
  const amount = transaction.amount;
  const isNegative = amount < 0;

  // Build tagMeta map for source badges in TagEditor
  const tagMeta = useMemo(() => buildTagMetaMap(originalSuggestedTags), [originalSuggestedTags]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
      {/* Transaction metadata */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">{transaction.date}</p>
      </div>

      {/* Amount */}
      <span
        className={cn(
          'text-sm font-mono tabular-nums flex-shrink-0',
          isNegative ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
        )}
      >
        {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2)}
      </span>

      {/* Inline tag editor — with source badge display in trigger */}
      <div className="flex-shrink-0 w-44">
        <TagEditor
          currentTags={tags}
          onSave={onSave}
          availableTags={availableTags}
          tagMeta={tagMeta}
        />
      </div>
    </div>
  );
}
