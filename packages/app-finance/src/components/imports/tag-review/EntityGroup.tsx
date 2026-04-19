import { BookmarkPlus, ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, ButtonPrimitive } from '@pops/ui';

import { GroupTagBar } from './GroupTagBar';
import { unionTags } from './tagReviewUtils';
import { TransactionTagRow } from './TransactionTagRow';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

import type { ConfirmedGroup } from './tagReviewUtils';

export interface EntityGroupProps {
  group: ConfirmedGroup;
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  availableTags: string[];
  onUpdateTag: (checksum: string, tags: string[]) => void;
  onApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
  onSaveTagRule: (group: ConfirmedGroup) => void;
  onSaveTagRuleForTransaction: (transaction: ConfirmedTransaction, tags: string[]) => void;
}

export function EntityGroup({
  group,
  localTags,
  suggestedTagMeta,
  availableTags,
  onUpdateTag,
  onApplyGroupTags,
  onSaveTagRule,
  onSaveTagRuleForTransaction,
}: EntityGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const currentUnion = unionTags(group.transactions.map((t) => localTags[t.checksum] ?? []));
  const suggestedUnion = useMemo(() => {
    return unionTags(
      group.transactions.map((t) => (suggestedTagMeta[t.checksum] ?? []).map((s) => s.tag))
    );
  }, [group.transactions, suggestedTagMeta]);

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

  const addGroupStagedTag = useCallback((tag: string) => {
    setGroupStagedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 flex-1 justify-start text-left hover:bg-transparent"
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

          {suggestedUnion.length > 0 && (
            <ButtonPrimitive
              variant="outline"
              size="xs"
              onClick={handleApplySuggestions}
              className="whitespace-nowrap"
              title={`Apply suggestions: ${suggestedUnion.join(', ')}`}
            >
              Apply suggestions
            </ButtonPrimitive>
          )}

          <ButtonPrimitive
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              onSaveTagRule(group);
            }}
            className="whitespace-nowrap text-muted-foreground hover:text-foreground"
            title="Save a reusable tag rule for this group"
            aria-label={`Save tag rule for ${group.entityName}`}
          >
            <BookmarkPlus className="w-3.5 h-3.5 mr-1" />
            Save tag rule…
          </ButtonPrimitive>
        </div>
      </div>

      {expanded && (
        <>
          <GroupTagBar
            stagedTags={groupStagedTags}
            availableTags={availableTags}
            onAddTag={addGroupStagedTag}
            onRemoveTag={removeGroupStagedTag}
            onApply={handleApplyStagedToGroup}
          />

          <div className="divide-y">
            {group.transactions.map((t) => (
              <TransactionTagRow
                key={t.checksum}
                transaction={t}
                tags={localTags[t.checksum] ?? []}
                suggestedTagMeta={suggestedTagMeta[t.checksum] ?? []}
                availableTags={availableTags}
                onSave={(tags) => onUpdateTag(t.checksum, tags)}
                onSaveTagRule={onSaveTagRuleForTransaction}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
