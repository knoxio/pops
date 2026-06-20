# PRD-129: Instagram Acquisition (yt-dlp + Cookies)

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Get the bytes off Instagram. yt-dlp invoked from the worker container (PRD-126), driven by a cookie file mounted from a host-side secret. Downloads the reel video + extracts the caption + writes both to `${FOOD_INGEST_DIR}/<sourceId>/`. Detects auth-dead conditions (cookies expired / challenged) and surfaces them to the review queue without burning BullMQ retries on hopeless attempts.

Acquisition is the most fragile part of Epic 02 — Instagram changes regularly. This PRD owns the spec for handling that fragility: detection, degradation, and the runbook hand-off to the operator.

PRD-130 picks up where this PRD leaves off (STT + vision processing of the downloaded video).

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/instagram-acquisition.ts
export async function runInstagramAcquisition(
  data: IngestJobData & { kind: 'url-instagram' }
): Promise<AcquisitionResult> {
  const workDir = `${FOOD_INGEST_DIR}/${data.sourceId}`;
  await ensureDir(workDir);

  // 1. Invoke yt-dlp
  const result = await runYtDlp({
    url: data.url,
    cookiesPath: process.env.INSTAGRAM_COOKIES_PATH,
    output: workDir,
    writeInfoJson: true,
    writeThumbnail: true,
    timeout: 60_000,
  });

  // 2. Classify result
  if (isAuthDead(result.stderr)) {
    return { ok: false, kind: 'auth-dead', stderr: result.stderr };
  }
  if (isRateLimited(result.stderr)) {
    return { ok: false, kind: 'rate-limited', retryAfter: parseRetryAfter(result.stderr) };
  }
  if (result.exitCode !== 0) {
    return { ok: false, kind: 'generic-failure', exitCode: result.exitCode, stderr: result.stderr };
  }

  // 3. Verify artifacts
  const videoPath = await firstMatch(workDir, /\.mp4$/);
  const infoJsonPath = await firstMatch(workDir, /\.info\.json$/);
  const thumbnailPath = await firstMatch(workDir, /\.jpg$|\.webp$/);

  if (!videoPath || !infoJsonPath) {
    return { ok: false, kind: 'missing-artifacts' };
  }

  // 4. Extract caption from info JSON
  const caption = await readCaption(infoJsonPath);

  return {
    ok: true,
    workDir,
    videoPath,
    infoJsonPath,
    thumbnailPath,
    caption,
  };
}

export type AcquisitionResult =
  | {
      ok: true;
      workDir: string;
      videoPath: string;
      infoJsonPath: string;
      thumbnailPath: string | null;
      caption: string | null;
    }
  | { ok: false; kind: 'auth-dead'; stderr: string }
  | { ok: false; kind: 'rate-limited'; retryAfter: number }
  | { ok: false; kind: 'generic-failure'; exitCode: number; stderr: string }
  | { ok: false; kind: 'missing-artifacts' };
```

PRD-130 wraps `runInstagramAcquisition` and continues with STT + vision on success. On failure, PRD-130's handler converts to the appropriate `IngestJobResult` (`partial` for auth-dead, `failed` for the rest).

## yt-dlp invocation

```bash
yt-dlp \
  --cookies /secrets/instagram-cookies.txt \
  --write-info-json \
  --write-thumbnail \
  --no-playlist \
  --format 'best[ext=mp4]/best' \
  --max-filesize 100M \
  --output '{workDir}/%(id)s.%(ext)s' \
  --socket-timeout 30 \
  --retries 2 \
  '{url}'
```

- `--no-playlist`: defensive; some Instagram URLs are post collections.
- `--format`: prefer mp4; fall back to best available container.
- `--max-filesize 100M`: defensive against unexpected long videos.
- `--socket-timeout 30 --retries 2`: yt-dlp's own retries, not BullMQ's. Cheap on network blips.

Spawned via `child_process.spawn`; stdout/stderr captured for classification.

### Output layout

```
${FOOD_INGEST_DIR}/<sourceId>/
  <reel_id>.mp4              # the video
  <reel_id>.info.json        # yt-dlp metadata (caption is in `description` field)
  <reel_id>.jpg              # thumbnail
```

`<reel_id>` is the Instagram media ID, extracted by yt-dlp from the URL. PRD-130 reads these paths from `AcquisitionResult` and processes them.

## Auth-dead detection

`isAuthDead(stderr)` checks the yt-dlp error output for known patterns:

```ts
const AUTH_DEAD_PATTERNS = [
  /login required/i,
  /Please log in/i,
  /Restricted Video.*log in/i,
  /Login cookies.*invalid/i,
  /authentication.*required/i,
  /This account is private/i, // misleading; we'd want to skip private accounts anyway
];
```

When matched: don't retry (BullMQ retries won't fix an auth issue). Worker writes a special `IngestJobResult.partial` outcome and creates the `ingest_sources` row with `caption=NULL`. Review queue surfaces a banner: "Instagram cookies need refresh — see runbook" with a "Mark as resolved" action that retriggers `food.ingest.retry`.

Patterns above are best-effort. Implementation should accept that yt-dlp's error messages change between releases. Adding new patterns is a small PR — no schema change.

## Rate-limit detection

`isRateLimited(stderr)` checks for HTTP 429 or yt-dlp's "Too Many Requests" string. Returns the recommended retry delay in seconds if Instagram included a `Retry-After` header (yt-dlp surfaces it). PRD-130's `convertAcquisitionFailure` translates the result into an `IngestJobResult` with `retryAfterSec: acq.retryAfter` (PRD-125's contract); the worker shell passes that to BullMQ via `job.changeDelay(retryAfterSec * 1000)` before throwing, so the next attempt fires after the delay.

If no `Retry-After` header: default delay 300 seconds (5 minutes). Conservative — Instagram rate limits are global per IP; retrying soon would just burn another attempt.

## Cookies

- Source: throwaway Instagram account; cookies exported via browser extension (e.g. "Get cookies.txt LOCALLY") and saved to `infra/secrets/instagram-cookies.txt` on the host.
- Mounted into the worker container at `/secrets/instagram-cookies.txt` (read-only) per PRD-126.
- File format: Netscape cookies.txt (what yt-dlp expects).
- Refresh procedure documented at `pillars/food/docs/runbooks/instagram-cookie-refresh.md` (this PRD creates the runbook stub).

### Runbook contents (`pillars/food/docs/runbooks/instagram-cookie-refresh.md`)

```markdown
# Instagram Cookie Refresh

When the food ingest pipeline reports "Instagram cookies need refresh", this runbook walks through the process.

## Symptoms

- Review queue shows pending Instagram ingests with the banner "Instagram cookies need refresh".
- `pops-worker-food` logs include yt-dlp errors matching `login required` / `cookies invalid`.
- `food.ingest.list` returns ingests in `state=partial` with `partialReason='auth-dead'`.

## Procedure

1. Open Chrome or Firefox profile dedicated to the throwaway IG account.
2. Visit https://www.instagram.com and verify you're logged in (re-enter password if prompted).
3. Use a cookies.txt-export extension (e.g. "Get cookies.txt LOCALLY") to export the cookies for `instagram.com`.
4. Save the file as `infra/secrets/instagram-cookies.txt` on the host running pops-worker-food.
5. Restart the worker container: `docker compose restart worker-food`.
6. Retry the failed ingests: for each, click "Mark as resolved" in the review queue (which calls `food.ingest.retry`).

## Avoiding bans

- Use a dedicated throwaway IG account, NEVER your main account.
- Don't refresh cookies more than once a day from new devices/IPs.
- If the throwaway account itself gets challenged or banned, create a new one and start over.

## Long-term mitigation

- If cookies need refreshing more than monthly, consider:
  - Reducing ingest frequency.
  - Investigating an alternative acquisition path (Instagram Graph API requires Meta business approval; unlikely for personal use).
  - Using a residential proxy for the worker's egress (out of scope for v1).
```

## Cancellation

Cancellation check happens BEFORE the yt-dlp call (cheap to abort) and AFTER (mark caption as captured but stop before PRD-130 processes). Mid-yt-dlp cancellation: yt-dlp child process killed via `process.kill('SIGTERM')`; partial files cleaned up via `rm -rf` of the workdir.

## Business Rules

- yt-dlp invocation is **single-shot per ingest** — no internal retry beyond yt-dlp's own `--retries 2` (those handle network blips, not auth/rate-limit).
- Auth-dead errors are NOT retried by BullMQ. The job exits with a result that surfaces in the review queue; operator action required.
- Rate-limited errors use BullMQ's delayed-retry; respect `Retry-After` when present, default 5 min otherwise.
- Cookies are mounted read-only into the container. The container never writes to the cookie file.
- The throwaway IG account is operator-managed; this PRD documents the lifecycle but doesn't automate it.
- Caption extracted from `info.json.description` field. Treat as opaque text; PRD-130 decides whether it's "structured enough" to skip STT.
- Video file kept under `${FOOD_INGEST_DIR}/<sourceId>/` for the source-media retention window (100 dirs FIFO per PRD-110). Survives PRD-130 processing.

## Edge Cases

| Case                                                                               | Behaviour                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cookies file missing                                                               | yt-dlp runs without cookies; most reels fail with login-required → auth-dead path.                                       |
| URL is a public reel that works without login                                      | yt-dlp succeeds without cookies; caption + video downloaded.                                                             |
| URL is a private account's reel that the throwaway IS following                    | Cookies allow access; download succeeds.                                                                                 |
| URL is a story (24-hour ephemeral)                                                 | yt-dlp may succeed; caption may be empty. PRD-130 will likely route to caption-only fallback or fail useful extraction.  |
| URL is a carousel post (multiple images, possibly with a video)                    | `--no-playlist` ensures only the single requested item downloads. If the URL targets the carousel root, only first item. |
| Caption is empty                                                                   | `caption=null`; PRD-130 sees no caption-shortcut available; routes to full STT + vision.                                 |
| Video exceeds `--max-filesize 100M`                                                | yt-dlp errors; classified as `generic-failure`.                                                                          |
| Instagram returns a "Try again later" generic error                                | Classified as `rate-limited` (best-effort pattern match); BullMQ delay-retries.                                          |
| yt-dlp version is outdated and Instagram API changed                               | Errors don't match known patterns; classified as `generic-failure`. Operator must rebuild image with newer yt-dlp.       |
| Worker disk full                                                                   | yt-dlp errors writing; `generic-failure`. PRD-110 eviction job should reclaim space on next tick.                        |
| URL is malformed (`https://instagram.com/foo`)                                     | yt-dlp errors with "URL doesn't match site"; classified as `generic-failure`; BullMQ does NOT retry (deterministic).     |
| Concurrent ingests of two different reels                                          | Each writes to its own workDir; no contention.                                                                           |
| Cookies path readable by the container but cookie content is for the wrong account | yt-dlp may succeed (cookies are valid) but content access might be restricted; depends on the reel.                      |

## Acceptance Criteria

Inline per theme protocol.

### Acquisition function

- [ ] `runInstagramAcquisition(data)` exported from `apps/pops-worker-food/src/handlers/instagram-acquisition.ts`.
- [ ] Returns `AcquisitionResult` per the type definition.
- [ ] Spawns yt-dlp with the documented flags; captures stderr.
- [ ] Workdir created if missing; matches `${FOOD_INGEST_DIR}/<sourceId>/`.

### Classification

- [ ] `isAuthDead(stderr)` matches each of the documented patterns (Vitest cases with sample stderr strings).
- [ ] `isRateLimited(stderr)` parses `Retry-After` when present; defaults to 300s otherwise.
- [ ] Generic failures captured with exit code + stderr.
- [ ] Missing video or info.json after a "successful" exit code returns `kind='missing-artifacts'` (defensive).

### Caption extraction

- [ ] `readCaption(infoJsonPath)` parses the JSON and returns the `description` field; null if absent.

### Cookie mount

- [ ] Container reads cookies from `${INSTAGRAM_COOKIES_PATH}` (default `/secrets/instagram-cookies.txt`).
- [ ] Mount is read-only (verified by docker-compose config in PRD-126 acceptance).

### Cancellation

- [ ] Cancellation token honoured before and after the yt-dlp call.
- [ ] Mid-call cancellation kills the yt-dlp child process; workdir cleaned up.

### Runbook

- [ ] `pillars/food/docs/runbooks/instagram-cookie-refresh.md` created with the documented contents.
- [ ] PRD-129 cross-references the runbook from its "auth-dead" handling.

### Tests

- [ ] Vitest unit tests at `apps/pops-worker-food/src/handlers/__tests__/instagram-acquisition.test.ts` with mocked `child_process` cover each `AcquisitionResult` variant.
- [ ] Stderr-pattern tests for auth-dead and rate-limited with real-world sample strings.
- [ ] Integration test (gated on `RUN_LIVE_IG_TESTS=1`; skipped in CI) hits a known-public reel and asserts a successful AcquisitionResult.

## Out of Scope

- STT + vision processing of the downloaded video — **PRD-130**.
- Instagram Graph API path — requires business approval; not pursued.
- Residential proxy for egress — operator-level concern.
- Cookie auto-refresh via headless browser — out of scope; operator runs the runbook.
- Multi-account cookie rotation — single throwaway in v1.
- Instagram saved-folder polling — explicitly out of scope per theme decisions.
- Per-reel cost tracking (yt-dlp is free) — no cost logged for this PRD; PRD-130 logs LLM costs.
- Handling of Instagram TV / IGTV / video posts — yt-dlp generally supports them; treat the same as reels.
