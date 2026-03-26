# US-01: Anomaly detection

> PRD: [055 — AI Inference & Monitoring](README.md)
> Status: Not started

## Description

As a user, I want the system to detect unusual spending patterns so that I'm alerted to unexpected changes.

## Acceptance Criteria

- [ ] Compares current period spend vs historical average per category
- [ ] Flags categories with spend > configured threshold above average (default 50%)
- [ ] Anomalies stored with: category, current amount, average amount, percentage change
- [ ] Anomalies surfaced in AI operations app dashboard
- [ ] Runs on schedule (daily or on new transaction import)

## Notes

Phase 3 feature. Start simple — percentage deviation from rolling average. Claude can be used for more sophisticated analysis later.
