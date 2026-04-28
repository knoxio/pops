/**
 * MessageThread — renders the list of messages for the selected conversation.
 *
 * User messages are right-aligned, assistant messages left-aligned.
 * Assistant messages render Markdown and display citation links.
 */
import { Bot, User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';

import { cn, Skeleton } from '@pops/ui';

import { CitationLink } from './CitationLink';

import type { ChatMessage } from '../../pages/chat-page/types';

export interface MessageThreadProps {
  /** Messages to display. */
  messages: ChatMessage[];
  /** Whether messages are currently loading. */
  isLoading: boolean;
  /** Whether a new message is being sent (shows typing indicator). */
  isSending: boolean;
  /** Partial streaming content from the assistant (null when not streaming). */
  streamingContent?: string | null;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

/** Render a single message bubble. */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/10 text-primary' : 'bg-app-accent/10 text-app-accent'
        )}
        aria-hidden
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-2 [&_code]:text-xs">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
            {message.citations.map((engramId) => (
              <CitationLink key={engramId} engramId={engramId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Typing indicator shown while waiting for assistant response (before tokens arrive). */
function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-app-accent">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/** Streaming message bubble — renders partial assistant content as it arrives. */
function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-app-accent">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] rounded-lg bg-muted/50 px-4 py-3 text-foreground">
        <div className="prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-2 [&_code]:text-xs">
          <Markdown>{content}</Markdown>
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  isLoading,
  isSending,
  streamingContent,
  className,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = streamingContent !== null && streamingContent !== undefined;

  // Auto-scroll to bottom when messages change, sending state changes, or streaming content updates.
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, streamingContent]);

  if (isLoading) {
    return (
      <div className={cn('flex-1 space-y-4 overflow-y-auto p-4', className)}>
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  return (
    <div className={cn('flex-1 space-y-4 overflow-y-auto p-4', className)}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingContent.length > 0 && <StreamingBubble content={streamingContent} />}
      {isSending && !isStreaming && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
