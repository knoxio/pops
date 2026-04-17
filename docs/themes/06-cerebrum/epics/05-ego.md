# Epic 05: Ego

> Theme: [Cerebrum](../README.md)

## Scope

Build the conversational agent that serves as the "I" of the system. Ego is a top-level peer of Cerebrum — it consumes Cerebrum's retrieval and emit capabilities to hold multi-turn conversations, answer questions grounded in engrams and POPS data, and perform actions on the user's behalf. Ego is accessible through multiple channels: a chat panel in the pops shell, MCP tools for Claude Code sessions, Moltbot for Telegram, and a CLI. This epic supersedes PRD-054 (AI Overlay).

## PRDs

| #   | PRD                                                | Summary                                                                              | Status      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| 087 | [Ego Core](../prds/087-ego-core/README.md)         | Conversation engine, context management, scope negotiation, conversation persistence | Not started |
| 088 | [Ego Channels](../prds/088-ego-channels/README.md) | Shell chat panel, MCP tools for Claude Code, Moltbot integration, CLI interface      | Not started |

PRD-087 (Core) must complete before PRD-088 (Channels) — the channels are thin adapters over the core conversation engine.

## Dependencies

- **Requires:** Epic 03 (Emit — Q&A, document generation, nudges), Epic 01 (Thalamus — retrieval)
- **Unlocks:** Full conversational access to the knowledge base from any channel

## Out of Scope

- Cerebrum internals (Ego delegates to Thalamus and Emit — it doesn't implement retrieval or curation)
- Autonomous actions without user prompt (Epic 06 — Reflex handles automation)
- Voice input/output (future — transcription is a pre-processing step, TTS is post-processing)

## Notes

This epic supersedes PRD-054 (AI Overlay) from Theme 05 (AI). PRD-054's scope (contextual assistant in the shell, domain-aware queries) is fully absorbed by Ego with the addition of Cerebrum-grounded retrieval and multi-channel support.
