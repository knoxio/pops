import { describe, expect, it } from 'vitest';

import { readConfig } from './watch-registry-and-reload.ts';

describe('readConfig', () => {
  it('falls back to documented defaults when env is empty', () => {
    const cfg = readConfig({});
    expect(cfg.registryUrl).toBe('http://registry-api:3001');
    expect(cfg.reloadCmd).toBe('nginx -s reload');
    expect(cfg.debounceMs).toBe(250);
    expect(cfg.backoffMs).toBe(1000);
    expect(cfg.outputPath.endsWith('apps/pops-shell/nginx.conf')).toBe(true);
  });

  it('threads env overrides through', () => {
    const cfg = readConfig({
      CORE_REGISTRY_URL: 'http://alt:9000',
      POPS_NGINX_OUTPUT: '/tmp/foo.conf',
      POPS_NGINX_RELOAD_CMD: 'docker kill -s HUP nginx',
      POPS_NGINX_DEBOUNCE_MS: '500',
      POPS_NGINX_BACKOFF_MS: '2000',
    });
    expect(cfg.registryUrl).toBe('http://alt:9000');
    expect(cfg.outputPath).toBe('/tmp/foo.conf');
    expect(cfg.reloadCmd).toBe('docker kill -s HUP nginx');
    expect(cfg.debounceMs).toBe(500);
    expect(cfg.backoffMs).toBe(2000);
  });

  it('rejects non-positive integers and falls back to defaults', () => {
    const cfg = readConfig({ POPS_NGINX_DEBOUNCE_MS: '-3', POPS_NGINX_BACKOFF_MS: 'abc' });
    expect(cfg.debounceMs).toBe(250);
    expect(cfg.backoffMs).toBe(1000);
  });
});
