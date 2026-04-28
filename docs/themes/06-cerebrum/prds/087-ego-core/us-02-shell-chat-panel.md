# US-02: Shell Chat Panel

> PRD: [PRD-087: Ego Core](README.md)
> Status: Partial

## Description

As a user, I want a chat panel in the pops shell that lets me have streaming conversations with Ego, browse conversation history, and see which engrams are being used as context so that I can interact with my knowledge base conversationally.

## Acceptance Criteria

- [x] A React component renders a chat panel accessible from the pops-shell sidebar — it can be opened as a slide-over panel or a dedicated route
- [x] The chat panel displays a conversation list (sorted by most recent, searchable by title) and a message thread view for the selected conversation
- [x] User messages are submitted via a text input with Shift+Enter for newlines and Enter to send — the input supports Markdown formatting
- [ ] Assistant responses stream in real-time using server-sent events from `ego.chat` — partial tokens render as they arrive with a typing indicator
- [x] Each assistant message displays cited engram IDs as clickable links that navigate to the engram detail view in Cerebrum
- [x] A context indicator shows the conversation's active scopes and the number of engrams currently loaded in context — clicking it expands to show the list of context engrams with their relevance scores
- [x] New conversations can be started with a "New conversation" button — the title is auto-generated from the first message and displayed in the conversation list
- [x] Conversations can be deleted from the conversation list with a confirmation prompt

## Notes

- The chat panel should follow the existing pops-shell design system — use the same component library, colours, and layout patterns.
- Streaming rendering should handle Markdown in the response — code blocks, lists, and links should render correctly as the stream arrives, not only after completion.
- The context indicator is important for transparency — the user should always know which scopes Ego is searching within and which engrams are influencing responses.
- Consider keyboard shortcuts: Cmd+K to open the chat panel, Escape to close it.
