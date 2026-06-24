# Idea: Nudge Delivery Channels

Forward-looking. The proactive-nudges PRD ships detection, persistence, act/dismiss, the REST surface, the in-app NudgesPage, and the shell bell. What is **not** built is active multi-channel delivery — today a nudge sits in `nudge_log` until the user opens the page or the shell bell badges its count. The glia autonomous-digest path writes its own `nudge_log` row (so the existing UI can surface a digest), but nudges are not pushed anywhere.

Build later:

## Moltbot / Telegram push

- Deliver new `pending` nudges to the existing Moltbot Telegram bot as a registered message source.
- Message carries title, type, a brief body excerpt, and inline buttons: **Act** (delegates to `POST /nudges/:id/act`, runs server-side, posts the result back to the chat), **Dismiss** (`POST /nudges/:id/dismiss`), **Details** (full nudge context).
- Check status before dispatch: nudges expired or dismissed before delivery are never sent.
- Delivery failures (bot API down) retry with exponential backoff (max 3) and log.

## Priority-tiered scheduling

- `high` → immediate to all enabled channels.
- `medium` → batched, at most once per hour.
- `low` → daily digest only.

## Daily digest

- A single consolidated Moltbot message summarising pending nudges: count by type plus the top 3 highest-priority titles. One message, not one per nudge.

## Delivery preferences

- Config (e.g. `engrams/.config/nudges.toml`): enable/disable each channel, quiet hours (default 22:00–08:00 local, no Telegram pushes inside the window), batch interval tuning.

## Shell notification text + CLI

- A richer shell notification line: title, type badge (`[consolidation]`, `[staleness]`, …), one-line summary, with `pops cerebrum nudges` to open the full list. The current shell surface is the badge-only bell.

## LLM consolidation synthesizer

- Acting on a `consolidate` nudge today produces the merged engram by concatenating each source body under a per-source heading (`ConcatenationSynthesizer`). The `BodySynthesizer` port and a try/catch fallback in `executeConsolidationAct` already exist for an LLM-backed merge, but no LLM synthesizer is implemented or wired.
- Build an Anthropic-backed `BodySynthesizer` that rewrites the cluster into one coherent curated document (dedup, reconcile overlaps, single voice), inject it into the nudge write-service, and keep concatenation as the deterministic fallback when the model call fails or `ANTHROPIC_API_KEY` is absent.

## Secret-scope redaction

- The PRD's original intent was that secret-scoped engrams participate in detection but their content never appears in a nudge title/body (reference by ID only). Today the only guard is top-level-scope-boundary clustering; there is no explicit redaction of secret content in emitted nudge text. Add a redaction pass for any channel that renders body text.

Original tracking refs: shell-notification text + Moltbot buttons (#2581), CLI listing (#2581).
