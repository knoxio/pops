import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getUpApiToken } from './up-client.js';

describe('getUpApiToken', () => {
  // Snapshot original env before each test and restore after
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['UP_API_TOKEN'];
    delete process.env['UP_API_TOKEN_FILE'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('reads token from UP_API_TOKEN environment variable', () => {
    process.env['UP_API_TOKEN'] = 'up:yeah:test-token-direct';
    expect(getUpApiToken()).toBe('up:yeah:test-token-direct');
  });

  it('reads token from UP_API_TOKEN_FILE environment variable', () => {
    const tokenContent = 'up:yeah:test-token-from-file\n';
    vi.spyOn(fs, 'readFileSync').mockReturnValue(tokenContent);

    process.env['UP_API_TOKEN_FILE'] = '/run/secrets/up_api_token';
    expect(getUpApiToken()).toBe('up:yeah:test-token-from-file');
    expect(fs.readFileSync).toHaveBeenCalledWith('/run/secrets/up_api_token', 'utf-8');
  });

  it('prefers UP_API_TOKEN_FILE over UP_API_TOKEN when both are set', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('token-from-file');

    process.env['UP_API_TOKEN_FILE'] = '/run/secrets/up_api_token';
    process.env['UP_API_TOKEN'] = 'token-direct';
    expect(getUpApiToken()).toBe('token-from-file');
  });

  it('throws when neither UP_API_TOKEN nor UP_API_TOKEN_FILE is set', () => {
    expect(() => getUpApiToken()).toThrow(
      'Up Bank API token not found. Set UP_API_TOKEN or UP_API_TOKEN_FILE environment variable.'
    );
  });

  it('trims whitespace from token read from file', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('  up:yeah:padded-token  \n');
    process.env['UP_API_TOKEN_FILE'] = '/run/secrets/up_api_token';
    expect(getUpApiToken()).toBe('up:yeah:padded-token');
  });
});
