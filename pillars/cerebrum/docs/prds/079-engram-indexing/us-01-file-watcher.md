# US-01: File Watcher

> PRD: [PRD-079: Engram Indexing & Sync](README.md)
> Status: Done

## Description

As the Thalamus indexing service, I need to watch the engram directory for file changes in real-time so that every create, modify, and delete event on `.md` files is detected and forwarded to the sync pipeline with minimal latency and no missed events.

## Acceptance Criteria

- [x] A `FileWatcherService` monitors `/opt/pops/engrams/` recursively using chokidar, watching for `add`, `change`, and `unlink` events on `.md` files only
- [x] Dotfiles and directories starting with `.` are excluded from watching (`.templates/`, `.config/`, `.archive/`, `.index/`)
- [x] File events are debounced with a 500ms window per file path — multiple rapid writes to the same file produce a single event forwarded to the sync pipeline
- [x] Events are batched — the watcher collects events during the debounce window and emits them as a batch array of `{ type: 'create' | 'modify' | 'delete', filePath: string }` objects
- [x] On startup, the watcher performs an initial scan of the engram directory and emits `create` events for all existing `.md` files not already in the index (reconciliation pass)
- [x] The startup reconciliation batches file processing (100 files per tick via `setImmediate` or equivalent) to avoid blocking the event loop during large initial scans
- [x] If the engram directory does not exist at startup, the service logs a clear warning, disables file watching, and allows Thalamus to continue starting (non-fatal — create the directory and restart to enable)
- [x] If the OS file watcher limit is exceeded, the service logs an error and falls back to periodic polling at a 60-second interval
- [x] The service exposes a health check method returning `{ watching: boolean, lastEventAt: string | null, watchedPaths: number }`

## Notes

- Use `chokidar` for cross-platform file watching — it handles macOS FSEvents and Linux inotify transparently.
- The debounce should be per-file, not global — two different files changing within 500ms should both produce events.
- The reconciliation pass on startup is critical for cold-start scenarios where the index database was deleted or the service was offline while files changed.
- The watcher should not process files itself — it emits events that the frontmatter sync service (US-02) consumes. Use an EventEmitter or similar pub/sub pattern.
- Consider `chokidar`'s `awaitWriteFinish` option for handling editors that write to temporary files before renaming.
