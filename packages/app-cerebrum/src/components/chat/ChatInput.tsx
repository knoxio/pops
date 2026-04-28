/**
 * ChatInput — text input for composing messages.
 *
 * Shift+Enter inserts a newline, Enter sends the message.
 * Uses the primitive Textarea from @pops/ui for consistent styling.
 */
import { SendHorizontal } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Textarea, cn } from '@pops/ui';

export interface ChatInputProps {
  /** Current input value. */
  value: string;
  /** Called when the input value changes. */
  onChange: (value: string) => void;
  /** Called when the user submits the message. */
  onSend: () => void;
  /** Whether a message is currently being sent. */
  isSending: boolean;
  /** Additional CSS classes. */
  className?: string;
}

export function ChatInput({ value, onChange, onSend, isSending, className }: ChatInputProps) {
  const { t } = useTranslation('cerebrum');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isSending) {
          onSend();
        }
      }
    },
    [value, isSending, onSend]
  );

  const canSend = value.trim().length > 0 && !isSending;

  return (
    <div className={cn('flex items-end gap-2', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('chat.placeholder')}
        rows={1}
        className="min-h-11 max-h-40 resize-none"
        aria-label={t('chat.input')}
        disabled={isSending}
      />
      <Button
        size="icon"
        onClick={onSend}
        disabled={!canSend}
        loading={isSending}
        aria-label={t('chat.send')}
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
