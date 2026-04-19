import { BookmarkPlus } from 'lucide-react';
import { useMemo } from 'react';

import { ButtonPrimitive } from '@pops/ui';

import { cn } from '../../../lib/utils';
import { TagEditor } from '../../TagEditor';
import { buildTagMetaMap } from './tagReviewUtils';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

export interface TransactionTagRowProps {
  transaction: ConfirmedTransaction;
  tags: string[];
  suggestedTagMeta: SuggestedTag[];
  availableTags: string[];
  onSave: (tags: string[]) => void;
  onSaveTagRule?: (transaction: ConfirmedTransaction, tags: string[]) => void;
}

/**
 * Single transaction row with inline tag editor.
 * Tags from suggestions show source badges (🤖 AI, 📋 Rule, 🏪 Entity).
 * Rule-sourced tags include a hover tooltip with the matched description_pattern.
 */
export function TransactionTagRow({
  transaction,
  tags,
  suggestedTagMeta,
  availableTags,
  onSave,
  onSaveTagRule,
}: TransactionTagRowProps) {
  const amount = transaction.amount;
  const isNegative = amount < 0;

  const tagMeta = useMemo(() => buildTagMetaMap(suggestedTagMeta), [suggestedTagMeta]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors group/txrow">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">{transaction.date}</p>
      </div>

      <span
        className={cn(
          'text-sm font-mono tabular-nums flex-shrink-0',
          isNegative ? 'text-destructive' : 'text-success'
        )}
      >
        {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2)}
      </span>

      {onSaveTagRule && (
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          onClick={() => onSaveTagRule(transaction, tags)}
          className="whitespace-nowrap text-muted-foreground hover:text-foreground opacity-0 group-hover/txrow:opacity-100 transition-opacity flex-shrink-0"
          title="Save a reusable tag rule for this transaction"
          aria-label={`Save tag rule for ${transaction.description}`}
        >
          <BookmarkPlus className="w-3.5 h-3.5 mr-1" />
          Save rule…
        </ButtonPrimitive>
      )}

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
