# US-02: Scheduled analysis

> PRD: [055 — AI Inference & Monitoring](README.md)
> Status: Not started

## Description

As a user, I want periodic analysis jobs so that I get regular summaries without asking.

## Acceptance Criteria

- [ ] Weekly summary: top spending categories, notable changes, budget status
- [ ] Monthly summary: total spend, category breakdown, year-over-year comparison
- [ ] Analysis results stored for display in AI operations app
- [ ] Schedule configurable (weekly on Sunday, monthly on 1st, etc.)
- [ ] Runs automatically via background job

## Notes

Summaries can be text-based (Claude generates a natural language summary from the data) or structured (data tables). Start with structured, add Claude-generated insights later.
