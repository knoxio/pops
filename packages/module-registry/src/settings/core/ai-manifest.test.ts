/**
 * Tests for the AI Configuration settings manifest.
 *
 * Issue #2463 — the global ai.model dropdown previously offered a single
 * snapshot-id option, leaking the deprecated `claude-haiku-4-5-20251001`
 * id and giving users no choice. These tests guard against regression.
 */
import { describe, expect, it } from 'vitest';

import { aiConfigManifest } from './ai-manifest.js';

import type { SettingsField, SettingsGroup } from '@pops/types';

describe('aiConfigManifest', () => {
  function findField(key: string): SettingsField | undefined {
    return aiConfigManifest.groups
      .flatMap((g: SettingsGroup) => g.fields)
      .find((f: SettingsField) => f.key === key);
  }

  it('exposes the model field with family-aliased options', () => {
    const field = findField('ai.model');
    expect(field).toBeDefined();
    expect(field?.type).toBe('select');
    expect(field?.options).toEqual([
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    ]);
  });

  it('uses the haiku family alias as the default (not the snapshot id)', () => {
    const field = findField('ai.model');
    expect(field?.default).toBe('claude-haiku-4-5');
  });

  it('does not expose any deprecated snapshot ids in the option list', () => {
    const field = findField('ai.model');
    const values = (field?.options ?? []).map((o: { value: string }) => o.value);
    for (const value of values) {
      expect(value, `option value ${value} should not be a snapshot id`).not.toMatch(/-\d{8}$/);
    }
  });
});
