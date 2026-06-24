# Idea: Bake the media toolchain (yt-dlp / ffmpeg / faster-whisper) into the food image

The food worker's Instagram pipeline shells out to external binaries —
`instagram/stt-whisper.ts` spawns `python3 -m faster_whisper.cli`,
`instagram/ffmpeg-keyframes.ts` spawns `ffmpeg`, and `instagram-yt-dlp.ts`
spawns `yt-dlp`. The published image (`pillars/food/Dockerfile`) is
`node:22-slim` + `curl` only. None of those binaries are present, and no
faster-whisper model is baked in. So in the running fleet the `url-web`,
`text`, and `screenshot` kinds work, but `url-instagram` acquisition / STT /
keyframe stages fail at runtime with spawn ENOENT (degrading to
`auth-dead` / `caption-only-fallback` partials at best).

## What to build

Extend `pillars/food/Dockerfile` (or split a worker-specific stage) so the
worker CMD has the toolchain available:

- Install `ffmpeg`, `python3`, `python3-venv`, `ca-certificates` in the
  runtime stage.
- Pin `yt-dlp` and `faster-whisper` via a venv `pip install` (pinned
  versions, not apt — yt-dlp moves fast).
- Bake the `distil-large-v3` faster-whisper model at build time (multi-stage:
  download in a `model-baker` stage, `COPY --from` the HuggingFace cache into
  the runtime stage) so the first IG job doesn't pay a cold model download.
- Record pinned tool versions in a committed `versions.json` next to the
  Dockerfile and surface them through `extractorVersion`. Updates are PRs that
  re-bake the image; the worker never self-updates yt-dlp at runtime.
- Keep the image under a sane size target (the original spec said < 2 GB);
  multi-stage keeps the Python build tooling out of the final layer.

Because the API server and worker currently share one image, decide whether
to (a) fatten the shared image with the toolchain, or (b) split a dedicated
`pops-worker-food` image so the API container stays lean. The compose service
already overrides the CMD; a second `Dockerfile.worker` + a publish-matrix
entry would be the clean split.

## Acceptance criteria (when built)

- [ ] Runtime image contains `ffmpeg`, `yt-dlp`, and `python3 -m faster_whisper.cli` on PATH.
- [ ] `distil-large-v3` model is present in the image (no network needed for the first STT job).
- [ ] Pinned versions live in `versions.json`; `extractorVersion` reflects them.
- [ ] An `url-instagram` job runs the acquisition → STT → keyframe → vision pipeline end-to-end inside the container without spawn ENOENT.
- [ ] Image size stays within target; CI builds it on PR.

## Out of scope

- GPU acceleration for faster-whisper — CPU only.
- testcontainers / docker-compose integration test spinning up worker + redis +
  mock api and asserting the `workerComplete` round-trip (infra not yet wired
  into the monorepo; the dispatch round-trip is covered by unit tests today).
