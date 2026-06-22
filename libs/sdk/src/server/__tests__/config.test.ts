import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetServerSdkConfig,
  configureServerSdk,
  getServerSdkConfig,
  resolveApiKey,
  SERVER_SDK_API_KEY_ENV,
} from '../config.js';

describe('configureServerSdk', () => {
  beforeEach(() => __resetServerSdkConfig());
  afterEach(() => __resetServerSdkConfig());

  it('starts with an empty config', () => {
    expect(getServerSdkConfig()).toEqual({});
  });

  it('shallow-merges later calls into the existing config', () => {
    configureServerSdk({ apiKey: 'first', callTimeoutMs: 1000 });
    configureServerSdk({ callTimeoutMs: 2000 });
    const config = getServerSdkConfig();
    expect(config.apiKey).toBe('first');
    expect(config.callTimeoutMs).toBe(2000);
  });

  it('replaces a field when the new value is explicit', () => {
    configureServerSdk({ apiKey: 'first' });
    configureServerSdk({ apiKey: 'second' });
    expect(getServerSdkConfig().apiKey).toBe('second');
  });
});

describe('resolveApiKey', () => {
  beforeEach(() => __resetServerSdkConfig());
  afterEach(() => __resetServerSdkConfig());

  it('prefers an explicitly configured key over the env var', () => {
    configureServerSdk({ apiKey: 'config-key' });
    const env = { [SERVER_SDK_API_KEY_ENV]: 'env-key' } as NodeJS.ProcessEnv;
    expect(resolveApiKey(env)).toBe('config-key');
  });

  it('falls back to the env var when no key is configured', () => {
    const env = { [SERVER_SDK_API_KEY_ENV]: 'env-key' } as NodeJS.ProcessEnv;
    expect(resolveApiKey(env)).toBe('env-key');
  });

  it('treats empty configured key as unset', () => {
    configureServerSdk({ apiKey: '' });
    const env = { [SERVER_SDK_API_KEY_ENV]: 'env-key' } as NodeJS.ProcessEnv;
    expect(resolveApiKey(env)).toBe('env-key');
  });

  it('returns undefined when neither config nor env supplies a key', () => {
    expect(resolveApiKey({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('treats empty env value as unset', () => {
    const env = { [SERVER_SDK_API_KEY_ENV]: '' } as NodeJS.ProcessEnv;
    expect(resolveApiKey(env)).toBeUndefined();
  });
});
