# Epic 05: Ego

> Theme: [Cerebrum](../README.md)

## Scope

Build the conversational agent that serves as the "I" of the system. Ego is a top-level peer of Cerebrum — it consumes Cerebrum's retrieval and emit capabilities to hold multi-turn conversations, answer questions grounded in engrams and POPS data, and perform actions on the user's behalf. Ego is accessible through multiple channels: a chat panel in the pops shell, MCP tools for Claude Code sessions, Moltbot for Telegram, and a CLI. This epic supersedes `ego-core` (AI Overlay).

## PRDs

| #   | PRD                                            | Summary                                                                              | Status  |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| 087 | [Ego Core](../prds/ego-core/README.md)         | Conversation engine, context management, scope negotiation, conversation persistence | Partial |
| 088 | [Ego Channels](../prds/ego-channels/README.md) | Shell chat panel, MCP tools for Claude Code, Moltbot integration, CLI interface      | Done    |

`ego-core` (Core) must complete before `ego-channels` (Channels) — the channels are thin adapters over the core conversation engine.

## Dependencies

- **Requires:** Epic 03 (Emit — Q&A, document generation, nudges), Epic 01 (Thalamus — retrieval)
- **Unlocks:** Full conversational access to the knowledge base from any channel

## Out of Scope

- Cerebrum internals (Ego delegates to Thalamus and Emit — it doesn't implement retrieval or curation)
- Autonomous actions without user prompt (Epic 06 — Reflex handles automation)
- Voice input/output (future — transcription is a pre-processing step, TTS is post-processing)

## Notes

This epic supersedes the old AI Overlay PRD from the former AI theme. Its scope (contextual assistant in the shell, domain-aware queries) is fully absorbed by Ego — folded into `ego-core` — with the addition of Cerebrum-grounded retrieval and multi-channel support.
