/**
 * FileWatcherService tests.
 *
 * Uses a real temp directory and chokidar to verify event emission, debouncing,
 * and reconciliation logic.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileWatcherService } from './watcher.js';

import type { WatchEvent } from './watcher.js';

/** Wait for the watcher to reach the `ready` state. */
function waitForReconciled(watcher: FileWatcherService, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('reconciled event timed out')), timeout);
    watcher.on('reconciled', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Collect all batch events until `count` total files have been reported. */
function collectBatches(
  watcher: FileWatcherService,
  count: number,
  timeout = 5000
): Promise<WatchEvent[]> {
  return new Promise((resolve, reject) => {
    const events: WatchEvent[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Expected ${count} events, got ${events.length}`)),
      timeout
    );
    watcher.on('batch', (batch) => {
      events.push(...batch);
      if (events.length >= count) {
        clearTimeout(timer);
        resolve(events);
      }
    });
  });
}

describe('FileWatcherService', () => {
  let root: string;
  let watcher: FileWatcherService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thalamus-watcher-'));
  });

  afterEach(async () => {
    if (watcher) await watcher.stop();
    rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('health() returns watching: false before start()', () => {
    watcher = new FileWatcherService(root);
    const h = watcher.health();
    expect(h.watching).toBe(false);
    expect(h.lastEventAt).toBeNull();
  });

  it('health() returns watching: true after start()', async () => {
    watcher = new FileWatcherService(root);
    const reconciled = waitForReconciled(watcher, 3000);
    watcher.start(new Set());
    await reconciled;
    expect(watcher.health().watching).toBe(true);
  });

  it('emits reconciled after initial scan on empty dir', async () => {
    watcher = new FileWatcherService(root);
    const reconciled = waitForReconciled(watcher, 3000);
    watcher.start(new Set());
    await expect(reconciled).resolves.toBeUndefined();
  });

  it('emits create events for pre-existing files not in existingPaths', async () => {
    // Write a file before starting the watcher.
    const file = join(root, 'note', 'test.md');
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(file, '# hello\n');

    watcher = new FileWatcherService(root, 200);

    const batchPromise = collectBatches(watcher, 1, 8000);
    const reconciled = waitForReconciled(watcher, 6000);

    // Pass empty set — so the file is not already indexed.
    watcher.start(new Set());

    await reconciled;
    const events = await batchPromise;

    expect(events.some((e) => e.type === 'create' && e.filePath === 'note/test.md')).toBe(true);
  }, 12_000);

  it('does NOT emit create events for files already in existingPaths', async () => {
    const file = join(root, 'note', 'already.md');
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(file, '# already indexed\n');

    watcher = new FileWatcherService(root, 200);
    const reconciled = waitForReconciled(watcher, 3000);

    let batchFired = false;
    watcher.on('batch', () => {
      batchFired = true;
    });

    watcher.start(new Set(['note/already.md']));
    await reconciled;

    // Wait a bit to see if any spurious batch events appear.
    await new Promise((r) => setTimeout(r, 300));
    expect(batchFired).toBe(false);
  });

  it('emits modify event when a file is changed', async () => {
    const dir = join(root, 'note');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'change.md');
    writeFileSync(file, '# original\n');

    watcher = new FileWatcherService(root, 200);

    // Register batch listener BEFORE starting so we don't miss anything.
    const batchPromise = collectBatches(watcher, 1, 8000);
    const reconciled = waitForReconciled(watcher, 6000);

    watcher.start(new Set(['note/change.md']));
    await reconciled;

    // Modify after watcher is ready.
    writeFileSync(file, '# modified\n');

    const events = await batchPromise;
    expect(events.some((e) => e.type === 'modify' && e.filePath === 'note/change.md')).toBe(true);
  }, 12_000);

  it('only emits .md files, not other extensions', async () => {
    writeFileSync(join(root, 'notes.txt'), 'should be ignored');
    writeFileSync(join(root, 'config.json'), '{}');
    const dir = join(root, 'note');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'valid.md'), '# md file');

    watcher = new FileWatcherService(root, 200);
    const batchPromise = collectBatches(watcher, 1, 8000);
    const reconciled = waitForReconciled(watcher, 6000);
    watcher.start(new Set());
    await reconciled;

    // Trigger the create for valid.md
    const events = await batchPromise;

    expect(events.every((e) => e.filePath.endsWith('.md'))).toBe(true);
    expect(events.every((e) => !e.filePath.endsWith('.txt'))).toBe(true);
  }, 12_000);

  it('ignores dotfiles and dotdirs', async () => {
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, '.git', 'hidden.md'), '# hidden');
    writeFileSync(join(root, '.dotfile.md'), '# dotfile');
    const dir = join(root, 'note');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'real.md'), '# real');

    watcher = new FileWatcherService(root, 200);
    const batchPromise = collectBatches(watcher, 1, 8000);
    const reconciled = waitForReconciled(watcher, 6000);
    watcher.start(new Set());
    await reconciled;

    const events = await batchPromise;
    expect(events.some((e) => e.filePath.includes('.git'))).toBe(false);
    expect(events.some((e) => e.filePath.startsWith('.'))).toBe(false);
  }, 12_000);

  it('stop() clears watchers and pending timers', async () => {
    watcher = new FileWatcherService(root, 200);
    const reconciled = waitForReconciled(watcher, 3000);
    watcher.start(new Set());
    await reconciled;
    await watcher.stop();
    expect(watcher.health().watching).toBe(false);
  });
});
