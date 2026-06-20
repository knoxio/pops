# US-03: Context Awareness

> PRD: [PRD-087: Ego Core](README.md)
> Status: Partial

## Description

As the Ego system, I need to know which pops app the user is currently in, what actions they've recently taken, and which engrams are actively loaded so that retrieval relevance improves based on the user's current context.

## Acceptance Criteria

- [x] The conversation engine receives app context on each message: the active pops app (e.g., `media`, `finance`, `inventory`, `cerebrum`), the current route or view, and optionally the entity being viewed (e.g., a specific movie, transaction, or engram)
- [x] App context is included in the system prompt augmentation — the LLM knows "the user is currently viewing their movie collection" or "the user is looking at transaction #1234"
- [x] When the user is viewing an engram in Cerebrum, that engram is automatically loaded into the conversation context with maximum relevance score, regardless of whether Thalamus retrieval would have found it
- [ ] Recent user actions (last 5, configurable) from the active pops app are summarised in the context — e.g., "user recently searched for 'sci-fi movies', viewed 'Blade Runner 2049', added a tag to 'Arrival'"
- [x] Context updates propagate to subsequent Thalamus queries — retrieval is biased toward engrams relevant to the active app context (e.g., querying in the finance app biases toward `personal.finance.*` scopes)
- [x] If the user switches pops apps mid-conversation (detected on the next message), the app context is updated and the system prompt is regenerated for the next turn
- [x] The `ego.context.getActive` procedure returns the current context state: active scopes, app context, and the list of engrams loaded in context with their relevance scores
- [x] App context is stored on the `conversations` row as JSON and persists across page refreshes

## Notes

- App context is passed from the pops-shell client to the server on each `ego.chat` call — the shell knows which app is active and passes it as metadata.
- "Recent actions" could be sourced from an activity log or reconstructed from recent API calls — the implementation detail is flexible, but the data should be concise (not a full audit log dump).
- Context awareness should improve response quality measurably — a question like "how much did I spend on that?" while viewing a trip engram should retrieve relevant finance data without the user specifying the trip name.
- The scope biasing from app context should be additive, not exclusive — it increases the relevance of app-related scopes without hiding other results entirely.
