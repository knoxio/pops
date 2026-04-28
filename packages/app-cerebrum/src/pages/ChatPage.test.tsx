import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Streaming chat mock ─────────────────────────────────────────────

const mockStream = vi.fn();

vi.mock('./chat-page/useStreamingChat', () => ({
  useStreamingChat: () => ({
    stream: mockStream,
    isStreaming: false,
    error: null,
    streamingContent: null,
    abort: vi.fn(),
  }),
}));

// ── tRPC mock ────────────────────────────────────────────────────────

const mockConversationsListQuery = vi.fn();
const mockConversationsGetQuery = vi.fn();
const mockChatMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidateList = vi.fn();
const mockInvalidateGet = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      ego: {
        conversations: {
          list: { invalidate: mockInvalidateList },
          get: { invalidate: mockInvalidateGet },
        },
      },
    }),
    ego: {
      conversations: {
        list: {
          useQuery: (...args: unknown[]) => mockConversationsListQuery(...args),
        },
        get: {
          useQuery: (...args: unknown[]) => mockConversationsGetQuery(...args),
        },
        delete: {
          useMutation: (opts: {
            onSuccess?: (data: { success: boolean }, variables: { id: string }) => void;
          }) => ({
            mutate: (input: { id: string }) => {
              mockDeleteMutate(input);
              opts.onSuccess?.({ success: true }, input);
            },
            isPending: false,
          }),
        },
      },
      chat: {
        useMutation: (opts: {
          onSuccess?: (data: {
            conversationId: string;
            response: unknown;
            retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
          }) => void;
        }) => ({
          mutate: (input: { conversationId?: string; message: string }) => {
            mockChatMutate(input);
            opts.onSuccess?.({
              conversationId: 'conv_1',
              response: {
                id: 'msg_2',
                conversationId: 'conv_1',
                role: 'assistant',
                content: 'Hello! How can I help?',
                citations: ['eng_test_001'],
                createdAt: '2026-04-27T12:01:00Z',
              },
              retrievedEngrams: [{ engramId: 'eng_test_001', relevanceScore: 0.92 }],
            });
          },
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

// ── react-markdown mock ──────────────────────────────────────────────

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}));

// ── react-router mock ────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => {
    const React = require('react');
    return React.createElement('a', { href: to }, children);
  },
}));

// ── UI mock ──────────────────────────────────────────────────────────

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    PageHeader: ({
      title,
      description,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'page-header' },
        React.createElement('h1', null, title),
        description && React.createElement('p', null, description)
      ),
    Button: ({ children, onClick, disabled, prefix, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        {
          onClick: onClick as () => void,
          disabled: disabled as boolean,
          ...rest,
        },
        prefix as React.ReactNode,
        children as React.ReactNode
      ),
    Input: ({ value, onChange, placeholder, className, ...rest }: Record<string, unknown>) =>
      React.createElement('input', {
        type: 'text',
        value: value as string,
        onChange: onChange as () => void,
        placeholder: placeholder as string,
        className: className as string,
        'aria-label': rest['aria-label'] as string,
      }),
    Textarea: React.forwardRef(
      (
        {
          value,
          onChange,
          placeholder,
          onKeyDown,
          rows,
          className,
          ...rest
        }: Record<string, unknown>,
        ref: React.Ref<HTMLTextAreaElement>
      ) =>
        React.createElement('textarea', {
          ref,
          value: value as string,
          onChange: onChange as () => void,
          onKeyDown: onKeyDown as () => void,
          placeholder: placeholder as string,
          rows: rows as number,
          className: className as string,
          'aria-label': rest['aria-label'] as string,
          disabled: rest.disabled as boolean,
        })
    ),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement('div', {
        className: `animate-pulse ${className ?? ''}`,
        'data-testid': 'skeleton',
      }),
    Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('span', { 'data-testid': 'badge', 'data-variant': variant }, children),
    EmptyState: ({
      title,
      description,
    }: {
      icon?: unknown;
      title: React.ReactNode;
      description?: React.ReactNode;
      size?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'empty-state' },
        React.createElement('div', null, title),
        description && React.createElement('div', null, description)
      ),
    AlertDialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) =>
      open
        ? React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              },
            },
            children
          )
        : null,
    AlertDialogContent: ({ children }: { children: React.ReactNode; size?: string }) =>
      React.createElement('div', { 'data-testid': 'alert-dialog-content' }, children),
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h3', null, children),
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    AlertDialogAction: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      variant?: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => React.createElement('button', { onClick, disabled }, children),
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) =>
      React.createElement('button', null, children),
    Collapsible: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'collapsible', 'data-open': open, onClick: () => onOpenChange(!open) },
        children
      ),
    CollapsibleTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
      asChild ? children : React.createElement('button', null, children),
    CollapsibleContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'collapsible-content' }, children),
    cn: (...args: unknown[]) =>
      args
        .filter((a) => typeof a === 'string')
        .join(' ')
        .trim(),
    formatRelativeTime: (dateStr: string) => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      return `${Math.floor(minutes / 60)}h ago`;
    },
  };
});

import { ChatPage } from './ChatPage';

// ── Mock data ────────────────────────────────────────────────────────

const mockConversations = [
  {
    id: 'conv_1',
    title: 'Budget discussion',
    activeScopes: ['finance'],
    appContext: null,
    model: 'claude-sonnet-4-20250514',
    createdAt: '2026-04-27T10:00:00Z',
    updatedAt: '2026-04-27T12:00:00Z',
  },
  {
    id: 'conv_2',
    title: 'Movie recommendations',
    activeScopes: ['media'],
    appContext: null,
    model: 'claude-sonnet-4-20250514',
    createdAt: '2026-04-26T08:00:00Z',
    updatedAt: '2026-04-26T09:00:00Z',
  },
];

const mockMessages = [
  {
    id: 'msg_1',
    conversationId: 'conv_1',
    role: 'user',
    content: 'What is my budget?',
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: '2026-04-27T12:00:00Z',
  },
  {
    id: 'msg_2',
    conversationId: 'conv_1',
    role: 'assistant',
    content: 'Your budget is **$500**.',
    citations: ['eng_finance_001'],
    toolCalls: null,
    tokensIn: 100,
    tokensOut: 50,
    createdAt: '2026-04-27T12:00:05Z',
  },
];

function setupDefaultMocks() {
  mockConversationsListQuery.mockReturnValue({
    data: { conversations: mockConversations, total: 2 },
    isLoading: false,
  });
  mockConversationsGetQuery.mockReturnValue({
    data: null,
    isLoading: false,
  });
}

function setupWithSelectedConversation() {
  mockConversationsListQuery.mockReturnValue({
    data: { conversations: mockConversations, total: 2 },
    isLoading: false,
  });
  mockConversationsGetQuery.mockImplementation(
    (input: { id: string }, opts: { enabled: boolean }) => {
      if (!opts.enabled || input.id !== 'conv_1') {
        return { data: null, isLoading: false };
      }
      return {
        data: {
          conversation: mockConversations[0],
          messages: mockMessages,
        },
        isLoading: false,
      };
    }
  );
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('ChatPage', () => {
  it('renders page header with title and description', () => {
    render(<ChatPage />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Converse with Ego about your knowledge base')).toBeInTheDocument();
  });

  it('renders conversation list with items', () => {
    render(<ChatPage />);
    expect(screen.getByText('Budget discussion')).toBeInTheDocument();
    expect(screen.getByText('Movie recommendations')).toBeInTheDocument();
  });

  it('shows empty state when no conversation is selected', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
  });

  it('displays messages when a conversation is selected', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByText('Budget discussion'));
    expect(screen.getByText('What is my budget?')).toBeInTheDocument();
  });

  it('renders citation links in assistant messages', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByText('Budget discussion'));
    const citationLink = screen.getByText('eng_finance_001');
    expect(citationLink).toBeInTheDocument();
    expect(citationLink.closest('a')).toHaveAttribute('href', '/cerebrum/eng_finance_001');
  });

  it('sends a message via the chat input', async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    const textarea = screen.getByLabelText('Message input');
    await user.type(textarea, 'Hello Ego');

    const sendButton = screen.getByLabelText('Send message');
    await user.click(sendButton);

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello Ego' }),
      expect.any(Object)
    );
  });

  it('Enter key sends message, Shift+Enter inserts newline', async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    const textarea = screen.getByLabelText('Message input');
    await user.type(textarea, 'Line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'Line two');

    // Shift+Enter should not have sent the message
    expect(mockStream).not.toHaveBeenCalled();

    // Enter sends
    await user.keyboard('{Enter}');
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatPage />);
    const sendButton = screen.getByLabelText('Send message');
    expect(sendButton).toBeDisabled();
  });

  it('new conversation button resets selection', async () => {
    setupWithSelectedConversation();
    const user = userEvent.setup();
    render(<ChatPage />);

    // Select a conversation
    await user.click(screen.getByText('Budget discussion'));

    // Click new conversation
    const newButton = screen.getByLabelText('New conversation');
    await user.click(newButton);

    // Should show empty state again
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog and calls delete', async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    const firstDeleteButton = screen.getByLabelText('Delete conversation: Budget discussion');
    await user.click(firstDeleteButton);

    // Confirmation dialog should appear
    expect(screen.getByText('Delete conversation?')).toBeInTheDocument();

    // Confirm deletion
    const confirmButton = screen.getByText('Delete');
    await user.click(confirmButton);

    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'conv_1' });
  });

  it('search input filters conversations', async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    const searchInput = screen.getByLabelText('Search conversations');
    await user.type(searchInput, 'budget');

    // The query should have been called with the search term
    expect(mockConversationsListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'budget' }),
      expect.anything()
    );
  });

  it('shows loading skeletons when conversations are loading', () => {
    mockConversationsListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<ChatPage />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the chat panel layout', () => {
    render(<ChatPage />);

    // The chat panel should render with its input area
    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
  });

  it('shows empty search message when no conversations match', () => {
    mockConversationsListQuery.mockReturnValue({
      data: { conversations: [], total: 0 },
      isLoading: false,
    });
    render(<ChatPage />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });
});
