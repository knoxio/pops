# US-04: Alert threshold configuration

> PRD: [055 — AI Inference & Monitoring](README.md)
> Status: Not started

## Description

As a user, I want to configure alert thresholds so that I control what triggers a notification.

## Acceptance Criteria

- [ ] Default threshold: 50% above average triggers an anomaly alert
- [ ] Configurable per category or globally
- [ ] Settings stored in core settings table
- [ ] UI in AI operations app for threshold management
- [ ] Can disable alerts entirely

## Notes

Start conservative — too many alerts becomes spam. Users should be able to tune sensitivity. Some categories (rent, mortgage) are naturally stable and don't need anomaly detection.
