# US-04: Scope Negotiation

> PRD: [PRD-087: Ego Core](README.md)
> Status: Done

## Description

As the Ego system, I need to infer appropriate scopes from conversation content so that retrieval is focused on the right domains without requiring the user to manually set scopes for every conversation.

## Acceptance Criteria

- [x] Explicit scope mentions in user messages are detected and applied: phrases like "at work", "for my personal stuff", "about the karbon project" are mapped to scope prefixes (`work.*`, `personal.*`, `work.projects.karbon`) using a configurable mapping in `glia.toml` or a dedicated scope-inference config
- [x] Topic inference analyses the conversation content (user messages + assistant responses) and proposes scope adjustments when the topic clearly falls within a specific scope domain — e.g., discussing recipes infers `personal.cooking.*`, discussing a specific client infers `work.clients.*`
- [x] Channel defaults provide baseline scopes when no explicit or inferred scopes are available: shell defaults to all non-secret scopes, Moltbot defaults to `personal.*`, MCP defaults to `work.*` (all configurable)
- [x] The `.secret.` scope segment is a hard block — scopes containing `.secret.` are never inferred or auto-added. The user must explicitly set them via `ego.context.setScopes` or a direct message like "include my secret notes"
- [x] Scope changes during a conversation are applied from the next retrieval query onward — they do not retroactively re-retrieve engrams for previous turns
- [x] The user can override inferred scopes at any time by explicitly stating scope preferences ("only look at personal stuff") or via the `ego.context.setScopes` API — explicit overrides always win over inference
- [x] Inferred scope changes are communicated to the user in the response — e.g., "I've narrowed the search to your work projects based on our discussion" — so the user is never surprised by scope changes
- [x] When no scopes can be determined (no explicit mention, no topic inference, no channel default), the conversation defaults to all non-secret scopes

## Notes

- Scope negotiation is a best-effort heuristic, not a rigid classifier. False positives (wrong scope inferred) are less harmful than false negatives (relevant scope excluded) because the user will notice irrelevant results and correct them.
- The explicit mention detection can start with simple keyword matching and evolve to LLM-based intent detection — keep the interface abstract enough to swap implementations.
- Channel defaults are important for Moltbot — quick captures from Telegram should default to personal scopes unless the user explicitly mentions work context.
- The `.secret.` hard block is critical for trust — the user must feel confident that casual conversation will never surface secret content. Only deliberate, explicit opt-in unlocks secret scopes.
