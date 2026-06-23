# Idea: Ego recent-action context + conversation-history summarisation

Two forward-looking extensions to the Ego conversation engine that are not built today.

## 1. Recent-action context awareness

Feed the conversation engine a concise summary of the user's recent actions in the
active pops app so retrieval relevance improves without the user spelling out
what they were just doing.

- On each chat turn, include the last N actions (default 5, configurable) from the
  active pops app in the system-prompt augmentation — e.g. "user recently searched
  for 'sci-fi movies', viewed 'Blade Runner 2049', added a tag to 'Arrival'".
- Source can be an activity log or reconstructed from recent pillar API calls. The
  payload must be concise (a short list, not a full audit-log dump).
- Goal: a question like "how much did I spend on that?" while viewing a trip engram
  retrieves relevant finance data without the user naming the trip.

Today the engine receives `appContext` (app, route, entityId, entityType) and biases
scopes / auto-loads the viewed engram, but it has no notion of _recent actions_. No
`recentActions` field exists on the chat input or in the system prompt.

## 2. Old-history summarisation wired into the chat pipeline

When a conversation exceeds the message window (default 20 turns), summarise the
older messages into a condensed block via the LLM and inject it as a leading system
message, freeing token budget for retrieval context.

- The summarised block should be produced as a background step that does not block
  the current turn; if it hasn't run yet, fall back to plain truncation.
- Optionally persist the compressed block on a `conversations.summarised_history`
  TEXT column so it survives across turns.

Today `ConversationEngine.summariseHistory()` exists and can produce a condensed
string from a message list, but it is **not wired into the chat pipeline**: the live
path (`buildLlmMessages`) simply truncates to the most recent N turns
(`history.slice(-maxHistoryMessages)`). There is no `summarised_history` column and
no condensed system message is injected. So conversations past the window silently
drop older turns rather than summarising them.

## 3. Engine tuning via settings

The engine's tuning knobs (max history messages, top-K retrieval, token budget,
relevance threshold) are currently hardcoded constants overridable only at
construction time. A future settings-backed config (per-conversation model override,
global defaults) would let the user tune Ego without a redeploy.
