/**
 * ConversationList — sidebar list of conversations sorted by most recent.
 *
 * Includes a search input, "New conversation" button, and delete with
 * confirmation via AlertDialog.
 */
import { MessageSquarePlus, Search } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  cn,
} from '@pops/ui';

import { ConversationListBody } from './ConversationListBody';

import type { ConversationSummary } from '../../pages/chat-page/types';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  className?: string;
}

export function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  isDeleting,
  searchQuery,
  onSearchChange,
  className,
}: ConversationListProps) {
  const { t } = useTranslation('cerebrum');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <ConversationListHeader onNew={onNew} />
      <ConversationSearchBar value={searchQuery} onChange={onSearchChange} />
      <div className="flex-1 overflow-y-auto" role="list" aria-label={t('chat.conversationList')}>
        <ConversationListBody
          conversations={conversations}
          isLoading={isLoading}
          selectedId={selectedId}
          searchQuery={searchQuery}
          onSelect={onSelect}
          onRequestDelete={setDeleteTarget}
        />
      </div>
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }
        }}
        isDeleting={isDeleting}
      />
    </div>
  );
}

function ConversationListHeader({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-3 py-3">
      <h2 className="text-sm font-semibold text-foreground">{t('chat.conversations')}</h2>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNew}
        prefix={<MessageSquarePlus className="h-4 w-4" />}
        aria-label={t('chat.newConversation')}
      >
        {t('chat.new')}
      </Button>
    </div>
  );
}

function ConversationSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="px-3 py-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={t('chat.searchConversations')}
          className="h-9 pl-8 text-sm"
          aria-label={t('chat.searchConversationsLabel')}
        />
      </div>
    </div>
  );
}

function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('chat.deleteConversation')}</AlertDialogTitle>
          <AlertDialogDescription>{t('chat.deleteConversationDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('chat.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {t('chat.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
