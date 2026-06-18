# Epic 02: Ingestion Pipeline

> Theme: [Food](../README.md)

## Scope

Build the end-to-end pipeline that takes a multimodal recipe source (URL, Instagram reel, screenshot, free text) and turns it into a draft `recipe_versions` row ready for the Epic 03 review queue. Covers: the ingest API + BullMQ queue contract; the `pops-worker-food` Docker container that consumes jobs; per-kind extraction paths; AI usage logging; and the Instagram cookie refresh runbook.

After this epic, the user can paste an Instagram reel URL into pops-shell and a draft recipe appears in the review queue within ~30 seconds for short reels (caption-only fast path) or ~2-3 minutes for reels requiring STT + vision. Recipe-website URLs with JSON-LD schema parse in seconds. Screenshots and free text route through Claude vision / Claude text and likewise produce drafts.

This epic is pipeline-only. The review queue UI that promotes drafts to canonical is Epic 03.

## PRDs

| #   | PRD                                                                           | Summary                                                                                               | Status      |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 125 | [Ingest API & BullMQ Queue Contract](../prds/125-ingest-api/README.md)        | `POST /api/food/ingest` endpoint; BullMQ `food.ingest` queue; job shape, retries, backoff; status API | Not started |
| 126 | [pops-worker-food Container](../prds/126-worker-container/README.md)          | Docker image (Node + Python venv + yt-dlp + ffmpeg + faster-whisper); long-running daemon; lifecycle  | Partial     |
| 127 | [Web URL — JSON-LD Extraction](../prds/127-web-jsonld/README.md)              | Fetch HTML, parse `application/ld+json` Recipe schema, map to draft. Fast path, no LLM call.          | Not started |
| 128 | [Web URL — LLM Fallback Extraction](../prds/128-web-llm-fallback/README.md)   | When JSON-LD absent: readability extract → DSL via text LLM. Slower path; one Claude call per ingest. | Not started |
| 129 | [Instagram Acquisition](../prds/129-instagram-acquisition/README.md)          | yt-dlp + cookie management; caption + video + info JSON download; auth-dead detection                 | Not started |
| 130 | [Instagram STT + Vision Pipeline](../prds/130-instagram-stt-vision/README.md) | Caption heuristic; conditional faster-whisper STT; ffmpeg scene-detect keyframes; Claude vision → DSL | Not started |
| 131 | [Screenshot Ingest](../prds/131-screenshot-ingest/README.md)                  | Single image → Claude vision → DSL extraction                                                         | Not started |
| 132 | [Text Ingest](../prds/132-text-ingest/README.md)                              | Free-text paste → Claude text → DSL extraction                                                        | Not started |
| 133 | [AI Usage Logging & Prompt Viewer](../prds/133-ai-usage-prompts/README.md)    | Log every LLM call to `ai_inference_log`; read-only prompt viewer at `/food/prompts`                  | Not started |

### Build order

```
125 ──► 126 ──► (127, 128, 129→130, 131, 132 in parallel)
                              ▲
133 ──────────────────────────┘  (133 provides the callClaudeWithLogging wrapper
                                  that 128, 130, 131, 132 consume; can be built first
                                  or in parallel with the handlers)
```

- **125** first (the queue contract is the integration point everything else publishes to).
- **126** second (container + daemon must exist before extraction paths can consume jobs).
- **127–132** all consume the queue and write drafts independently. They can be built in parallel but each is a self-contained ingest kind.
- **130** depends on **129** (yt-dlp must download the video before STT/vision can process it). The two PRDs are split because acquisition (auth, cookies, rate limits) is a distinct concern from STT/vision processing (CPU work, model loading, prompt design).
- **133** is consumed by 127–132 but can be built first or in parallel — it provides the `logInference()` helper and the prompt-registration shape.
- IG cookie refresh runbook lives at `../runbooks/instagram-cookie-refresh.md` and is referenced from PRD-129's edge cases.

PRD count is 9 (not 8 as the question batch hinted) — the splits asked for added up to 9 once Instagram became two PRDs. The extra PRD keeps each focused on a single concern.

## Dependencies

- **Requires:** Epic 00 (schema: `ingest_sources` from PRD-110; `recipe_versions` from PRD-107; DSL compile from PRDs 114-117). The pipeline writes drafts via the same `food.recipes.create` path Epic 01 exposes (PRD-119).
- **Requires:** Existing `ai_inference_log` table and `app-ai` module (theme 05). New rows use `domain='food'` and operation strings specific to each ingest path.
- **Requires:** Redis + BullMQ stack (already in use for finance imports and cerebrum).
- **Unlocks:** Epic 03 (the review queue surfaces what this epic produces).

## Key Decisions

| Decision                 | Choice                                                                                               | Rationale                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Worker shape             | Long-running daemon container polling BullMQ; small worker pool                                      | yt-dlp / ffmpeg / faster-whisper warm in memory between jobs; matches existing POPS BullMQ pattern                       |
| Instagram error recovery | Hierarchical degradation: full pipeline → caption + vision → caption-only → manual-paste prompt      | Each step records what was usable in `meta.json`; review queue sees partial results instead of hard failures             |
| LLM prompt location      | Prompts as TS constants in the worker code; read-only viewer page at `/food/prompts`                 | Mirrors `packages/app-finance/src/pages/PromptViewerPage.tsx` pattern. Future PRD can move prompts to DB for editability |
| STT runtime              | CPU `faster-whisper` with `distil-large-v3` model                                                    | Self-host the cheap part; consistent with theme decision (no homelab GPU dependency)                                     |
| Vision provider          | Claude vision API (Haiku 4.5 default, Sonnet 4.6 for keyframe-heavy reels — configurable per-ingest) | Self-host text/STT; pay for the part that matters (recipe text overlays on reels)                                        |
| Concurrent jobs          | Worker pool size 2 by default (configurable via `FOOD_WORKER_CONCURRENCY`)                           | Keeps Claude vision spend bounded; faster-whisper is CPU-heavy and shouldn't compete with itself                         |
| Job retry policy         | BullMQ default exponential backoff (3 attempts); cookie-related failures NOT retried                 | Cookie auth dead = retry won't fix it; needs operator action. Other failures (network blips, rate limits) retry          |

## Risks

- **Instagram cookie fragility** — Throwaway-account cookies expire and get challenged. Mitigation: PRD-129 documents the refresh runbook; worker detects auth failure via yt-dlp error string and writes a special `ingest_sources.kind='url-instagram'` row with `caption=NULL` that the review queue surfaces as "auth needs refresh". No retries on this error.
- **Claude vision cost** — Bounded at ≤5 keyframes per reel + ≤1 vision call per ingest. PRD-133 logs every call; monthly budget alert via AI ops module (separate theme).
- **STT misses on-screen-only quantities** — Reel says "salt" but the on-screen overlay says "1 tsp". Mitigation: PRD-130's prompt explicitly instructs the vision model to extract on-screen text and prefer it over STT transcript when both are present.
- **yt-dlp breakage** — Instagram changes its API; yt-dlp lags by hours-to-days. Mitigation: pin yt-dlp version in the container; auto-update via Watchtower in homelab deploy; runbook documents how to roll back.
- **Worker container size** — Python + faster-whisper model + ffmpeg + yt-dlp is large (~2-3 GB). Mitigation: multi-stage Dockerfile; model downloaded at build time, not runtime. PRD-126 captures the build pattern.
- **Job stalls in queue** — A buggy ingest hangs the worker. Mitigation: BullMQ stalled-job detection (configurable); kill-and-retry after `FOOD_INGEST_TIMEOUT_SEC` (default 300). Hard timeout per ingest.
- **LLM rate limits** — Anthropic rate-limits at the API key level. Mitigation: BullMQ rate limiter; configurable. Pop the next job only if the rate budget allows.

## Out of Scope

- The review queue UI — **Epic 03**.
- iOS Share Sheet integration — separate iOS app theme (deferred).
- Bulk re-ingest of past sources — operator runs PRD-125's API multiple times; no batch endpoint.
- IG "saved" folder auto-poll — explicitly out of scope per theme decisions.
- HEIC/AVIF screenshot support — PRD-131 accepts JPEG/PNG/WebP only (matches PRD-124).
- Voice input ingestion — not modelled.
- LLM prompt editing UI — read-only viewer in v1; editable-prompts-in-DB is a future PRD.
- Multi-language reel handling beyond what `faster-whisper` and Claude vision support natively — translation step deferred.
- Cross-ingest dedup (same URL ingested twice) — deferred. v1 creates a new ingest_source row each time.
