# US-01: Conversation Engine

> PRD: [PRD-087: Ego Core](README.md)
> Status: Partial

## Description

As the Ego system, I need a multi-turn conversation engine that manages message history, assembles context windows with Cerebrum retrieval, and streams LLM responses so that users can hold grounded conversations about their knowledge base.

## Acceptance Criteria

- [x] A `ConversationEngine` class manages conversation lifecycle: create conversation, append user message, generate assistant response, retrieve conversation history
- [x] On each user message, the engine queries Thalamus (`cerebrum.retrieval.search`) with the message content scoped to the conversation's `active_scopes`, retrieves the top-K engrams (configurable, default 5), and injects their content into the context window as grounded references with engram IDs
- [x] Context window assembly follows priority order: (1) system prompt with Cerebrum capabilities and active scopes, (2) conversation history (most recent N messages, configurable, default 20), (3) engrams already loaded in the conversation context, (4) newly retrieved engrams for the current query — truncated by lowest relevance score when total tokens exceed the model limit
- [x] When conversation history exceeds the message window (N messages), older messages are summarised into a condensed block by the LLM and stored as a system message, freeing token budget for retrieval context
- [x] The system prompt describes: what Cerebrum is, what engrams are, the user's active scopes, available tools (search, ingest, link), and instructions to cite engram IDs when referencing stored knowledge
- [ ] Responses are streamed via server-sent events — partial tokens are delivered to the client as they arrive from the LLM
- [x] After the response completes, the engine extracts cited engram IDs from the response content, stores them in the message's `citations` array, and logs `tool_calls` if any tools were invoked during the turn
- [x] Token counts (`tokens_in`, `tokens_out`) are recorded per message from the LLM response metadata

## Notes

- The conversation engine should be channel-agnostic — it accepts text input and produces text output. Channel-specific concerns (UI rendering, MCP tool formatting, Telegram markup) are handled by the adapters in PRD-088.
- Thalamus retrieval results should be formatted as clearly delimited blocks in the context (e.g., `[Engram: eng_20260417_0942_agent-coordination] ...content...`) so the LLM can reference them naturally.
- The summarisation of old messages is a background step — it should not block the current turn. If summarisation hasn't run yet, the engine simply truncates older messages.
- Consider making the LLM model configurable per conversation or globally via settings — default to the configured model but allow overrides.
