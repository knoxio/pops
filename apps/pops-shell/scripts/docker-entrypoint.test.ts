import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = resolve(SCRIPT_DIR, '..', 'docker-entrypoint.sh');

/**
 * The boot entrypoint (PRD-255) is the only thing standing between a
 * registry outage and a dead shell. These guards pin the load-bearing
 * invariants so a future edit can't quietly break the "always boots"
 * contract or the supervision shape.
 */
describe('docker-entrypoint.sh', () => {
  it('declares a strict shell and errexit/nounset', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src.startsWith('#!/bin/sh')).toBe(true);
    expect(src).toMatch(/^set -eu$/m);
  });

  it('restores the committed static fallback on a failed boot-render', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    // The boot_render path must copy the fallback back over the served
    // conf when the rendered conf is invalid — never leave a broken render
    // in place.
    expect(src).toMatch(/cp "\$FALLBACK_CONF" "\$SERVED_CONF"/);
    // And the dynamic render must be gated by an nginx -t validation.
    expect(src).toContain('served_conf_is_valid');
  });

  it('reads the registry URL from POPS_REGISTRY_URL with a CORE_REGISTRY_URL fallback', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src).toMatch(/POPS_REGISTRY_URL:-\$\{CORE_REGISTRY_URL:-http:\/\/core-api:3001\}/);
  });

  it('starts both nginx and the watcher and supervises them', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src).toMatch(/nginx -g 'daemon off;' &/);
    expect(src).toMatch(/node "\$WATCH_BUNDLE" &/);
    // Supervision must watch BOTH pids and exit when either dies.
    expect(src).toMatch(/kill -0 "\$nginx_pid"/);
    expect(src).toMatch(/kill -0 "\$watch_pid"/);
  });

  it('overrides the watcher config-test to a plain `nginx -t` (the served conf is a fragment)', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src).toMatch(/POPS_NGINX_CONFIG_TEST_CMD="nginx -t"/);
  });

  it('passes shellcheck in POSIX sh mode when shellcheck is available', async () => {
    try {
      await execFileAsync('shellcheck', ['-s', 'sh', ENTRYPOINT]);
    } catch (err: unknown) {
      if (isCommandNotFound(err)) return;
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`shellcheck reported issues:\n${detail}`, { cause: err });
    }
  });
});

function isCommandNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}
