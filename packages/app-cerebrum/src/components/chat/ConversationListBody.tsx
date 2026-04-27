/**
 * ConversationListBody — the scrollable list body showing conversations,
 * loading skeletons, or an empty message.
 */
import { Skeleton } from '@pops/ui';

import { ConversationListItem } from './ConversationListItem';

import type { ConversationSummary } from '../../pages/chat-page/types';

interface ConversationListBodyProps {
  conversations: ConversationSummary[];
  isLoading: boolean;
  selectedId: string | null;
  searchQuery: string;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

export function ConversationListBody({
  conversations,
  isLoading,
  selectedId,
  searchQuery,
  onSelect,
  onRequestDelete,
}: ConversationListBodyProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 px-3 py-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2 py-1">
      {conversations.map((conv) => (
        <ConversationListItem
          key={conv.id}
          conversation={conv}
          isSelected={selectedId === conv.id}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </div>
  );
}
