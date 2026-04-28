# US-04: Notification Delivery

> PRD: [PRD-084: Proactive Nudges](README.md)
> Status: Partial

## Description

As a user, I want nudges delivered via shell notifications and Moltbot (Telegram) so that I receive actionable suggestions where I already am, without needing to actively check for them, and without being overwhelmed by notification noise.

## Acceptance Criteria

- [x] New nudges with `status: pending` are delivered to two channels: (1) the pops shell notification system (appears on next shell interaction), and (2) Moltbot on Telegram (immediate delivery)
- [ ] Shell notifications display the nudge title, type badge (e.g., `[consolidation]`, `[staleness]`), and a one-line summary — the user can run `pops cerebrum nudges` to see the full list
- [ ] Moltbot messages include the nudge title, type, a brief body excerpt, and inline action buttons: "Act" (executes the suggested action), "Dismiss" (marks as dismissed), "Details" (shows full nudge context)
- [ ] Delivery respects nudge priority: `high` nudges are delivered immediately to both channels; `medium` nudges are batched and delivered at most once per hour; `low` nudges are included in a daily digest only
- [ ] A daily digest message is sent via Moltbot summarising all pending nudges: count by type, top 3 highest-priority nudges with titles
- [ ] Users can configure delivery preferences via `engrams/.config/nudges.toml`: enable/disable channels, set quiet hours (no Moltbot messages between configured times), adjust batch intervals
- [ ] Nudges that are expired or dismissed before delivery are not sent — the delivery system checks status before dispatching
- [ ] Delivery failures (Moltbot API down, shell session inactive) are retried with exponential backoff (max 3 retries) and logged

## Notes

- Shell notifications use the existing pops shell notification framework — this story adds Cerebrum nudges as a notification source, not a new notification system.
- Moltbot delivery uses the existing Moltbot Telegram bot framework — the nudge delivery module registers as a Moltbot message source.
- The "Act" button on Moltbot delegates to `cerebrum.nudges.act` — the action executes server-side and the result is sent back to the Telegram chat.
- Quiet hours are important — nudges about staleness or patterns should not wake the user at 3am. Default quiet hours should be 22:00-08:00 local time.
- The daily digest should be a single consolidated message, not one message per nudge.
