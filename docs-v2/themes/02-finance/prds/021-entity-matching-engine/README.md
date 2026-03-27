# PRD-021: Entity Matching Engine

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: To Review

## Overview

Build the entity matching engine that powers the import pipeline. Given a raw transaction description, the engine determines which entity (merchant/payee) it belongs to. Uses a 5-stage matching chain with AI fallback, plus learned correction rules.

## Matching Chain (Priority Order)

### Stage 0: Learned Corrections (Highest Priority)

Before the entity matching pipeline, check the corrections table for a learned rule:
- Query `v_active_corrections` (confidence >= 0.7) with fuzzy match on normalized description
- If match found with confidence >= 0.9 → **matched**
- If match found with confidence < 0.9 → **uncertain**
- Includes location override and tags from the correction
- Normalization: uppercase, remove numbers, normalize whitespace

### Stage 1: Manual Aliases

Per-entity alias map. Case-insensitive substring search in the description.
- Example: alias "MCDs" → entity "McDonald's". Description "MCDS NORTH SYDNEY" matches.
- Each entity can have multiple aliases (comma-separated in DB)

### Stage 2: Exact Match

Full description equals entity name (case-insensitive).
- "WOOLWORTHS" matches entity "Woolworths"

### Stage 3: Prefix Match

Description starts with entity name (case-insensitive). Longest entity name wins if multiple match.
- "WOOLWORTHS BONDI JCT" matches "Woolworths" via prefix
- If both "Shell" and "Shell Energy" exist as entities, "SHELL ENERGY MONTHLY" matches "Shell Energy" (longest)

### Stage 4: Contains Match

Entity name found anywhere in description (case-insensitive). Minimum 4 characters. Longest entity name wins.
- "PAYMENT TO NETFLIX" matches "Netflix" via contains (7 chars, above 4 min)
- Short entity names (< 4 chars) skipped to prevent false positives

### Stage 5: Punctuation Stripping

Remove apostrophes from both description and entity names, retry stages 2-4.
- "MCDONALDS NORTH SYDNEY" matches "McDonald's" after stripping apostrophe

### Stage 6: AI Fallback

If no match from stages 0-5, call Claude Haiku API:
- Send raw CSV row (JSON) — merchant description context only, no PII
- Claude returns `{ entityName, category }`
- If returned entity exists in lookup → **matched**
- If returned entity is new → **uncertain** with confidence 0.7
- Cache result: in-memory + disk (`ai_entity_cache.json`)
- Cache key: normalized raw row (uppercase, trimmed)
- Rate limiting: exponential backoff on HTTP 429 (50 RPM Anthropic limit), max 5 retries
- Cost tracking: log to ai_usage table (tokens, cost, cached flag, import_batch_id)
- Named environments (test/dev) skip AI calls → return null

## Data Dependencies

- **Entity lookup**: `{ name → id }` loaded from entities table once per import batch
- **Aliases**: comma-separated per entity → `{ alias → entity_name }` map
- **AI cache**: `ai_entity_cache.json` loaded from disk on first access per process

## Business Rules

- Match type returned with each result: "alias", "exact", "prefix", "contains", "ai", "none"
- Corrections take priority over all other matching — they represent learned user intent
- AI fallback is non-fatal — if Claude is unavailable, transaction routes to uncertain (not failed)
- AI caching is aggressive — same description never triggers two API calls
- AI cache hits recorded in ai_usage with `cached = 1` and zero tokens/cost
- Only merchant description sent to Claude — no account numbers, card numbers, or PII

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Entity name < 4 chars | Skipped in contains match (false positive prevention) |
| Multiple prefix matches | Longest entity name wins |
| AI returns entity that doesn't exist in DB | Routes to uncertain — user creates or selects manually |
| AI unavailable (no key, rate limited, credits exhausted) | Non-fatal warning; transaction goes to uncertain |
| AI cache corrupted | Recreated from scratch on next import |
| Named environment (test DB) | AI calls skipped entirely |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-entity-lookup](us-01-entity-lookup.md) | Load entity lookup and alias maps from database | Not started |
| 02 | [us-02-correction-match](us-02-correction-match.md) | Stage 0: match against learned corrections (fuzzy, confidence threshold) | Done |
| 03 | [us-03-rule-matching](us-03-rule-matching.md) | Stages 1-5: alias, exact, prefix, contains, punctuation stripping | Done |
| 04 | [us-04-ai-fallback](us-04-ai-fallback.md) | Stage 6: Claude Haiku API call with caching, rate limiting, cost tracking | Done |
| 05 | [us-05-tag-suggestion](us-05-tag-suggestion.md) | Tag suggestion pipeline: correction tags → AI category → entity defaults | Partial |

US-02, US-03, US-04 can parallelise after US-01.

## Verification

- ~95-100% hit rate with aliases on real bank CSV data
- Correction matches take priority over all other strategies
- AI fallback caches results and never sends PII
- Cost tracking is accurate per API call
- Named environments skip AI entirely
- All match types correctly identified in output

## Out of Scope

- Import wizard UI (PRD-020)
- Deduplication (PRD-022)
- AI rule creation from corrections (PRD-027)
