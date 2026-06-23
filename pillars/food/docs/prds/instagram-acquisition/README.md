# Instagram Acquisition (yt-dlp + cookies)

**Status: Done.** Acquisition, stderr classification, cancellation, cookie mount, and the operator runbook all ship in `pillars/food/src/worker/handlers/`. The only deferred piece is an opt-in live integration test against a real public reel — see [ideas/instagram-acquisition-live-test.md](../../ideas/instagram-acquisition-live-test.md).

Get the bytes off Instagram. The food worker spawns the pinned `yt-dlp` with a host-mounted cookie file, downloads a single reel's video, extracts the caption from yt-dlp's metadata, and writes both to `${FOOD_INGEST_DIR}/<sourceId>/`. It detects auth-dead and rate-limited conditions and surfaces them structurally so the BullMQ worker neither burns retries on hopeless attempts nor retries too eagerly on a global IP rate limit.

This is the most fragile stage of the ingestion pipeline — Instagram changes regularly. This spec owns the fragility handling: detection, structured degradation, and the runbook hand-off to the operator. The downstream STT + vision pipeline (`instagram/orchestrator.ts`) consumes a successful `AcquisitionResult` directly.

## Acquisition surface

`runInstagramAcquisition(data, ctx?, opts?)` in `pillars/food/src/worker/handlers/instagram-acquisition.ts` returns a discriminated `AcquisitionResult`:

```ts
type AcquisitionResult =
  | {
      ok: true;
      workDir;
      videoPath;
      infoJsonPath;
      thumbnailPath: string | null;
      caption: string | null;
    }
  | { ok: false; kind: 'auth-dead'; stderr: string }
  | { ok: false; kind: 'rate-limited'; retryAfter: number }
  | { ok: false; kind: 'generic-failure'; exitCode: number; stderr: string }
  | { ok: false; kind: 'missing-artifacts' }
  | { ok: false; kind: 'cancelled' };
```

Flow: cancellation check → ensure workdir → spawn yt-dlp (with a cancellation poll wired to an `AbortSignal`) → cancellation check → classify stderr → verify artefacts → read caption. The orchestrator wraps the failure variants through `convertAcquisitionFailure` (`instagram/convert-acquisition-failure.ts`) into the queue's `IngestJobResult`.

The spawn wrapper and the pure classifiers live in `instagram-yt-dlp.ts` (`runYtDlp`, `isAuthDead`, `isRateLimited`), split out so the classifiers stay trivially testable.

## yt-dlp invocation

Spawned via `child_process.spawn('yt-dlp', …)`, stdout/stderr captured:

```
--cookies <cookiesPath> --write-info-json --write-thumbnail --no-playlist
--format 'best[ext=mp4]/best' --max-filesize 100M
--output '<workDir>/%(id)s.%(ext)s' --socket-timeout 30 --retries 2 <url>
```

- `--no-playlist`: defensive; some IG URLs are post collections — only the requested item downloads.
- `--format`: prefer mp4, fall back to best container.
- `--max-filesize 100M`: guard against unexpectedly long videos.
- `--socket-timeout 30 --retries 2`: yt-dlp's own retries for network blips — distinct from BullMQ's, and cheap.

A 60s wall-clock timeout (overridable) fires a SIGTERM, escalated to SIGKILL after a 5s grace, so a wedged yt-dlp can never stall a worker slot. On any signal termination `exitCode` is reported as `-1`; `timedOut` distinguishes a timeout from an external abort.

### Output layout

```
${FOOD_INGEST_DIR}/<sourceId>/
  <reel_id>.mp4         # the video
  <reel_id>.info.json   # yt-dlp metadata (caption lives in `description`)
  <reel_id>.jpg|.webp   # thumbnail (optional)
```

`<reel_id>` is yt-dlp's media id from the URL. Artefacts are matched by extension (`.mp4`, `.info.json`, `.jpg/.jpeg/.png/.webp`). Video file is retained under the source's workdir for the media-retention window (FIFO eviction owned by the retention job) and survives downstream STT/vision processing.

## Classification

- **Auth-dead** (`isAuthDead`): best-effort case-insensitive match against known yt-dlp auth-failure strings — `login required`, `Please log in`, `Restricted Video … log in`, `Login cookies … invalid`, `authentication … required`, `This account is private`. Generous on purpose: yt-dlp's wording drifts between releases, and adding a pattern is a small PR with no schema change.
- **Rate-limited** (`isRateLimited`): matches `HTTP Error 429`, `Too Many Requests`, or `rate limit`. Returns the `Retry-After` value (seconds) when yt-dlp surfaces the header; otherwise defaults to 300s — IG rate limits are global per IP, so retrying soon just burns another attempt. Non-numeric or zero `Retry-After` also falls back to 300s.
- **Generic-failure**: any non-zero exit that matches neither pattern; carries `exitCode` + `stderr`.
- **Missing-artifacts**: yt-dlp exited 0 but the `.mp4` or `.info.json` is absent (defensive).

Caption extraction (`readCaption`) parses the info JSON's `description` field; returns `null` on a missing/empty description, absent file, or invalid JSON — downstream treats that as "no caption shortcut" and routes to full STT + vision.

## Failure → result mapping

`convertAcquisitionFailure` translates each failure into an `IngestJobResult`:

- `auth-dead` → `{ ok: true, partialReason: 'auth-dead', dsl: <placeholder> }` — surfaced as a partial draft (not a failure) so the review queue shows the cookie-refresh prompt with a retry action, instead of treating it as a dead job. The placeholder DSL renders an "Instagram ingest pending — cookies need refresh" recipe stub keyed on `sourceId`.
- `rate-limited` → `{ ok: false, errorCode: 'InstagramRateLimited', retryAfterSec }` — `retryAfterSec` propagates into BullMQ's backoff so the next attempt fires after the delay.
- `generic-failure` → `{ ok: false, errorCode: 'InstagramAcquisitionFailed' }` with a truncated stderr tail.
- `missing-artifacts` → `{ ok: false, errorCode: 'InstagramArtifactsMissing' }`.
- `cancelled` → `{ ok: false, errorCode: 'Cancelled' }`.

`partialReason: 'auth-dead' | 'rate-limited'` are members of the queue contract's closed `PartialReason` enum.

## Cookies

- Source: a dedicated **throwaway** Instagram account; cookies exported via a browser cookies.txt extension to `infra/secrets/instagram-cookies.txt` on the host.
- Mounted **read-only** into the worker at `/secrets/instagram-cookies.txt`. The container never writes to the cookie file.
- Path resolved from `INSTAGRAM_COOKIES_PATH` (default `/secrets/instagram-cookies.txt`), loaded in the worker config alongside `FOOD_INGEST_DIR`.
- File format: Netscape `cookies.txt` (what yt-dlp expects).
- Refresh procedure: `pillars/food/docs/runbooks/instagram-cookie-refresh.md`. Auth-dead handling cross-references this runbook.

## Cancellation

Cooperative, via the handler's `ctx.isCancelled()`:

- Checked **before** spawn (cheap abort, no workdir cleanup needed).
- **Polled** while yt-dlp runs (default 1s); a cancel fires the `AbortSignal`, which SIGTERMs the child.
- Checked **after** the child exits.

Any cancellation returns `{ kind: 'cancelled' }` and `rm -rf`s the workdir to drop partial files.

## Business rules

- yt-dlp invocation is **single-shot per ingest** — no internal retry beyond yt-dlp's own `--retries 2`.
- Auth-dead is **not** BullMQ-retried; it surfaces a partial draft requiring operator action.
- Rate-limited uses BullMQ's delayed retry; respect `Retry-After` when present, 5 min otherwise.
- Cookies are read-only; the container never writes them.
- Caption is treated as opaque text; the downstream pipeline decides whether it's structured enough to skip STT.
- The throwaway account is operator-managed; this spec documents the lifecycle but does not automate it.

## Edge cases

| Case                                  | Behaviour                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| Cookies file missing                  | yt-dlp runs cookie-less; most reels fail with login-required → auth-dead.           |
| Public reel, no login needed          | Succeeds cookie-less; caption + video downloaded.                                   |
| Private account the throwaway follows | Cookies grant access; download succeeds.                                            |
| Story / empty caption                 | May succeed with `caption=null`; downstream routes to full extraction.              |
| Carousel post                         | `--no-playlist` downloads only the requested item.                                  |
| Video over 100M                       | yt-dlp errors → `generic-failure`.                                                  |
| "Try again later" generic IG error    | Best-effort matched as `rate-limited`; BullMQ delay-retries.                        |
| Outdated yt-dlp vs changed IG API     | Unrecognised stderr → `generic-failure`; operator rebuilds image with newer yt-dlp. |
| Worker disk full                      | Write fails → `generic-failure`; retention eviction reclaims space.                 |
| Malformed URL                         | yt-dlp errors → `generic-failure` (deterministic; not worth BullMQ retrying).       |
| Concurrent ingests                    | Each writes its own `<sourceId>` workdir; no contention.                            |
| Wedged yt-dlp                         | Timeout → SIGTERM → SIGKILL after grace; `exitCode=-1`, `timedOut=true`.            |

## Acceptance criteria

Acquisition

- [x] `runInstagramAcquisition(data, ctx?, opts?)` returns `AcquisitionResult`; spawns yt-dlp with the documented flags and captures stderr.
- [x] Workdir resolved to `${FOOD_INGEST_DIR}/<sourceId>/` (env or injected override) and created if missing.
- [x] On clean success returns full artefact paths; `thumbnailPath` is `null` when no thumbnail was written.

Classification

- [x] `isAuthDead(stderr)` matches each documented pattern and rejects unrelated/empty stderr (table-driven Vitest cases).
- [x] `isRateLimited(stderr)` parses `Retry-After` when present and defaults to 300s for missing/non-numeric/zero values.
- [x] Generic failures carry `exitCode` + `stderr`; a 0-exit with no `.mp4`/`.info.json` returns `missing-artifacts`.

Caption

- [x] `readCaption(infoJsonPath)` returns the `description` field; `null` for empty/missing/absent/invalid-JSON.

Cookies

- [x] Cookie path resolves from `INSTAGRAM_COOKIES_PATH` (default `/secrets/instagram-cookies.txt`) and is passed to yt-dlp `--cookies`.

Cancellation

- [x] Cancellation honoured before spawn, mid-spawn (SIGTERM via `AbortSignal`), and after exit; mid/after cancellation `rm -rf`s the workdir.
- [x] `runYtDlp` escalates SIGTERM → SIGKILL after the grace period and reports `exitCode=-1` on signal termination.

Failure mapping

- [x] `convertAcquisitionFailure` maps auth-dead → partial draft (`partialReason='auth-dead'` + placeholder DSL), rate-limited → `retryAfterSec`, and the rest → typed `errorCode`s.

Runbook

- [x] `pillars/food/docs/runbooks/instagram-cookie-refresh.md` documents symptoms, refresh steps, ban avoidance, and long-term mitigation; auth-dead handling links to it.

Tests

- [x] Vitest unit tests mock `child_process` and cover every `AcquisitionResult` variant plus the `runYtDlp` spawn/timeout/abort/SIGKILL paths.
- [ ] Opt-in live integration test against a known-public reel (deferred — see idea file).
