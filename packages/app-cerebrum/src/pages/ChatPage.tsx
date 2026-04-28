import { useTranslation } from 'react-i18next';

/**
 * ChatPage — route-level component for Ego conversations.
 *
 * Renders the PageHeader and delegates to ChatPanel with the
 * useChatPageModel hook for all data and interaction logic.
 */
import { PageHeader } from '@pops/ui';

import { ChatPanel } from '../components/chat/ChatPanel';
import { useChatPageModel } from './chat-page/useChatPageModel';

export function ChatPage() {
  const { t } = useTranslation('cerebrum');
  const model = useChatPageModel();

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <PageHeader title={t('chat.title')} description={t('chat.description')} />
      <ChatPanel model={model} className="flex-1" />
    </div>
  );
}
