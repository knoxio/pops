# Idea: Live Instagram acquisition integration test

Forward-looking. The acquisition pipeline ([prds/instagram-acquisition](../prds/instagram-acquisition/README.md)) is fully unit-tested with a mocked `child_process`, so every `AcquisitionResult` branch is exercised without touching the network. What's missing is an end-to-end smoke test that proves the _real_ `yt-dlp` binary, the _real_ cookie file, and the _real_ Instagram response still produce a successful `AcquisitionResult`.

## What to build

An opt-in integration test, gated on an env flag (e.g. `RUN_LIVE_IG_TESTS=1`) and **skipped in CI**, that:

- Hits a known stable, public reel (no login required) so it passes even with no/expired cookies.
- Spawns the actual `yt-dlp` from the worker image's runtime stage (not the mock).
- Asserts `ok: true` with a non-null `videoPath` and `infoJsonPath`, and that the video file exists and is non-empty.
- Optionally asserts `caption` is a string for a reel known to have a caption.

## Why it's deferred

- It depends on a network resource that is fragile by design — the whole point of the auth-dead/rate-limited classification is that Instagram is unreliable. A live test that flakes in CI would erode trust in the suite, hence the hard CI skip.
- It needs the worker container's pinned `yt-dlp` available locally, which only matters once someone is debugging acquisition against the real binary.

## Notes

- Pick a reel from an account unlikely to delete it; if the chosen reel disappears the test must be repointed, so document the URL inline.
- A second gated variant could exercise the **cookie** path against a private account the throwaway follows, but that requires live cookies and is even more fragile — only worth it when diagnosing a specific cookie regression.
- Keep it out of the default `vitest` run and out of CI Gate; it's a manual diagnostic, not a gate.
