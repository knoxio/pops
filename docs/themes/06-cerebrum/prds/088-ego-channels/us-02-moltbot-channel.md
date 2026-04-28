# US-02: Moltbot Channel

> PRD: [PRD-088: Ego Channels](README.md)
> Status: Done

## Description

As a user on Telegram, I want Moltbot skills for quick capture and knowledge queries so that I can add content to Cerebrum and ask questions from my phone without opening the pops shell.

## Acceptance Criteria

- [x] A `/capture` Moltbot skill accepts a text message after the command (e.g., `/capture Had a great idea about agent routing`) and calls `cerebrum.ingest.quickCapture` with `source: 'moltbot'`, returning a confirmation message with the engram ID and title
- [x] A `/ask` Moltbot skill accepts a question (e.g., `/ask what do I know about LangGraph?`) and creates a one-shot Ego query with the Moltbot default scope (`personal.*`, configurable), returning the answer formatted for Telegram Markdown
- [x] Both skills follow the existing Moltbot skill registration pattern: exported skill definition with name, description, command, and handler function
- [x] `/ask` responses include citations as linked engram titles — each citation links to the engram's URL in the pops shell (e.g., `[Agent Coordination](https://pops.local/cerebrum/eng_20260417_...)`)
- [x] `/capture` with no text after the command returns an error message: "Send some text after /capture to save it"
- [x] Responses exceeding Telegram's 4096-character message limit are split into multiple messages at paragraph or sentence boundaries — never mid-word or mid-formatting
- [x] Scope-aware responses: `.secret.` scoped content is never included in `/ask` responses. If the user explicitly asks for secret content (e.g., `/ask include secrets: what's my bank password?`), the response explains that secret content requires the shell UI
- [x] Error responses (Ego unavailable, Thalamus timeout, ingest failure) return user-friendly Telegram messages with the error category, not stack traces

## Notes

- Moltbot is the lowest-friction input channel — `/capture` should complete in under 2 seconds for a simple text note.
- The default scope for Moltbot (`personal.*`) reflects that Telegram messages are typically personal context. The user can override per-message by including scope hints in the text (handled by Ego's scope negotiation).
- Consider supporting forwarded messages as capture input — a user forwarding an article or conversation snippet to Moltbot could trigger a capture with the forwarded content as the body.
- Moltbot already handles Telegram API rate limits and formatting — the skill just needs to return the response content and let Moltbot handle delivery.
