# Idea: result cache for the AI categorizer

> Source: split out of the Entity Matching Engine PRD — described as built, but the live categorizer does not use it.

## Problem

The import-time AI fallback (`categorizeWithAi`) calls Anthropic fresh for every unmatched description. There is no result cache in the categorization path, so re-importing the same merchant — or two rows with the same description in one batch — can each pay for an API call. Cost control today relies only on the env gate (AI off by default) and the model being cheap.

A disk cache module (`api/modules/ai-usage-cache.ts`, `ai_entity_cache.json`) and its maintenance endpoints (`/ai-usage/cache`, `…/prune`) still exist, but the categorizer neither reads nor writes them — they are inert except for stats/prune.

## Build later

- Wire `getCachedEntry` / `setCachedEntry` into `categorizeWithAi`: on entry, key by the normalized raw row (uppercase, trimmed) and short-circuit to the cached `{ entityName, tags }` without an API call.
- On a real API hit, write the result back to the cache (in-memory + disk).
- Count cache hits in the batch `aiUsage` counters (the `aiCacheHits` field already exists) and surface them distinctly from API calls.
- Handle legacy entries that carry only `{ entityName, category }` via the existing category→tag fallback.
- Corrupt cache file ⇒ recreate from scratch on next import (don't fail the run).
- Keep "same description never triggers two API calls within a batch" as the acceptance bar.

## Notes

This is purely a cost/latency optimization; correctness is unaffected because identical descriptions deterministically produce the same suggestion. Gate behind the existing `FINANCE_AI_CATEGORIZER_ENABLED` flag.
