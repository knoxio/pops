# Runbook: Instagram Cookie Refresh

When the food ingest pipeline reports "Instagram cookies need refresh", this runbook walks through the process. Covers symptoms, refresh procedure, and ban-avoidance guidance.

## Symptoms

- Review queue (Epic 03; exact route to be defined when that epic ships) shows pending Instagram ingests with a banner indicating the cookies need refresh.
- `pops-worker-food` logs include yt-dlp errors matching `login required` / `cookies invalid` / `Please log in`.
- `food.ingest.list({ state: 'partial' })` returns ingests with `partialReason='auth-dead'`.
- New Instagram ingests created via `/food/ingest` complete quickly with `state='partial'` instead of processing fully.

## Procedure

### Prerequisites

- A dedicated throwaway Instagram account (NOT your main account).
- Browser profile (Chrome or Firefox) that's signed into the throwaway account.
- A cookies.txt export browser extension installed in that profile. Recommended: **"Get cookies.txt LOCALLY"** (Chrome / Firefox).
- Shell access to the host running `pops-worker-food`.

### Steps

1. **Verify login.** Open the browser profile and visit https://www.instagram.com. Confirm you're logged in to the throwaway account. Re-enter password if prompted.

2. **Export cookies.** Click the cookies.txt extension icon while on instagram.com. Save the exported file (default name `instagram.com_cookies.txt`).

3. **Place the file on the host.** Copy the exported file to:

   ```
   infra/secrets/instagram-cookies.txt
   ```

   on the host running `pops-worker-food`. Overwrite the existing file. (`infra/secrets/.gitignore` excludes this file from git.)

4. **Restart the worker.** Cookies are mounted read-only and read at yt-dlp invocation time, so a process restart is the cleanest way to pick up the new file:

   ```bash
   docker compose -f infra/docker-compose.yml restart worker-food
   ```

5. **Retry failed ingests.** Open the review queue (Epic 03 surface). For each ingest with the "cookies need refresh" banner, trigger the retry action — this calls `food.ingest.retry` (PRD-125) and the job re-enqueues with fresh cookies. (Exact UI affordance is defined when Epic 03 ships; until then, `food.ingest.retry` can be called directly from the API client or pops-cli.)

6. **Verify a fresh ingest.** Submit one new Instagram URL via `/food/ingest`. Confirm it completes with `state='completed'` (not `'partial'`).

## Avoiding Bans

The throwaway account is the single most fragile piece of the Instagram pipeline. Once banned, you start over. Practices that reduce risk:

- **Dedicated account.** Never use your main or any account you'd be sad to lose. This account exists solely for yt-dlp cookies.
- **Stable IP.** The cookies were exported with one IP (your browser session). The worker uses a different IP (your host). Instagram tolerates this for normal use but stacks of cross-IP traffic look suspicious.
- **Low frequency.** This pipeline is single-user, low-volume. If you're ingesting more than ~20 reels a day, slow down. Use the `FOOD_INGEST_RATE_PER_MIN` env var (defaults to 30/min in PRD-125 but you can lower it).
- **No bulk re-ingest.** Don't re-ingest your whole saved folder at once. Stagger.
- **Watch for soft challenges.** Sometimes IG shows a "Confirm it's you" prompt to the throwaway account. If it happens, complete the challenge in the browser AND re-export cookies (they often regenerate during a challenge).
- **No automation of login.** Never script the login flow. Log in via a real browser session, every time.

## Long-Term Mitigation

If cookies need refreshing more frequently than ~monthly, consider:

- **Reduce ingest frequency.** Single biggest factor.
- **Investigate the Instagram Graph API.** Requires Meta business approval; unlikely for personal use, but worth checking if your situation qualifies.
- **Residential proxy for the worker's egress.** Makes the worker's traffic look like home browsing. Out of scope for v1; meaningful infra change.
- **Mirror to other sources.** If a creator you follow also posts to YouTube or a blog, ingest from there instead — recipe websites (PRD-127) and YouTube (future) are far more stable acquisition paths.

## Related

- [PRD-129 — Instagram Acquisition](../prds/129-instagram-acquisition/README.md): the spec that detects auth-dead and routes here.
- [PRD-130 — Instagram STT + Vision Pipeline](../prds/130-instagram-stt-vision/README.md): downstream consumer.
- [Food pillar risks](../README.md#risks): "Instagram cookie fragility" — the architectural acknowledgment that this runbook exists.
