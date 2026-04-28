/**
 * ConversationListItem — a single row in the conversation sidebar.
 *
 * Shows title, relative timestamp, and a delete button on hover.
 */
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn, formatRelativeTime } from '@pops/ui';

import type { ConversationSummary } from '../../pages/chat-page/types';

export interface ConversationListItemProps {
  conversation: ConversationSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

export function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
  onRequestDelete,
}: ConversationListItemProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <div
      role="listitem"
      className={cn(
        'group flex items-center rounded-md transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className="flex min-w-0 flex-1 flex-col px-3 py-2.5 text-left"
        aria-current={isSelected ? 'true' : undefined}
      >
        <span className="truncate text-sm font-medium">
          {conversation.title ?? t('chat.untitledConversation')}
        </span>
        <span className="text-2xs text-muted-foreground">
          {formatRelativeTime(conversation.updatedAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRequestDelete(conversation.id)}
        className="mr-2 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label={`Delete conversation: ${conversation.title ?? 'Untitled'}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
