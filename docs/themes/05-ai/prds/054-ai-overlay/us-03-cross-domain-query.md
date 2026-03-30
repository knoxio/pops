# US-03: Cross-domain queries

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a user, I want to ask questions that span multiple domains so that I get a unified answer.

## Acceptance Criteria

- [ ] "Show me everything related to IKEA" → transactions + inventory items
- [ ] Results include clickable links via universal object URIs (ADR-012)
- [ ] Clicking a result navigates to the specific item/page
- [ ] Query fan-out across relevant domains based on question intent
- [ ] Results grouped by domain in the response

## Notes

The URI resolver (ADR-012) maps URIs to tRPC procedures. The AI determines which domains to query based on the question.
