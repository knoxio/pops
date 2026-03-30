# US-03: Moltbot Telegram alerts

> PRD: [055 — AI Inference & Monitoring](README.md)
> Status: Not started

## Description

As a user, I want alerts and summaries delivered via Telegram so that insights reach me proactively.

## Acceptance Criteria

- [ ] Anomaly alerts sent to Telegram via Moltbot
- [ ] Weekly/monthly summaries sent on schedule
- [ ] Messages formatted for Telegram (markdown, not HTML)
- [ ] Includes relevant amounts, percentages, and comparison data
- [ ] Links to POPS pages via universal URIs where applicable
- [ ] Restricted to owner's Telegram user ID (whitelist)

## Notes

Moltbot is the existing Telegram assistant. This adds proactive outbound messages (currently Moltbot is reactive — responds to commands).
