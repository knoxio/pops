# US-01: Model configuration

> PRD: [053 — AI Configuration & Rules](README.md)
> Status: Done

## Description

As a user, I want to configure AI model settings so that I can control which model is used and set spending limits.

## Acceptance Criteria

- [x] Model selector (dropdown of supported models)
- [x] Monthly token budget field (max tokens per month)
- [x] Fallback behaviour when budget exceeded: skip AI / alert only
- [x] Settings saved to core settings table
- [x] Current month usage shown for comparison against budget
- [x] Toast confirmation on save

## Notes

Currently only Claude Haiku is supported. The selector is forward-looking — when more models are available, they appear here.
