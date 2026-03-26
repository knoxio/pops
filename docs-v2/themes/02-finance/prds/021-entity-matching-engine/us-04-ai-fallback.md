# US-04: AI fallback (Stage 6)

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want Claude Haiku called as a fallback when rule-based matching fails so that unknown merchants still get categorised.

## Acceptance Criteria

- [x] Called only when stages 0-5 all fail
- [x] Sends raw CSV row (JSON) to Claude Haiku — merchant description only, no PII
- [x] Prompt asks for `{ entityName, category }` response in JSON
- [x] Response parsed (handles markdown code fences)
- [x] If returned entity exists in entity lookup → "matched"
- [x] If returned entity is new → "uncertain" with confidence 0.7
- [x] Cache: in-memory + disk (`ai_entity_cache.json`), key = normalized raw row
- [x] Cache hit returns cached result without API call, logged with cached=1
- [x] Rate limiting: exponential backoff + jitter on HTTP 429, max 5 retries
- [x] Cost tracking: tokens + cost logged to ai_usage table per call
- [x] Named environments (test/dev DB) skip AI entirely → return null
- [x] AI failure is non-fatal: transaction routes to uncertain, warning added

## Notes

Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output. Typical cost: ~$1-5/month. Error codes: API_ERROR, INSUFFICIENT_CREDITS, RATE_LIMIT — all non-fatal.
