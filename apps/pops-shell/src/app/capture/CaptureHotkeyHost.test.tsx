import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  useCaptureHotkey: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) =>
    mocks.query({ pillarId, path: [...path], input }),
}));

vi.mock('./useCaptureHotkey', () => ({
  useCaptureHotkey: (args: { key: string; enabled: boolean; onTrigger: () => void }) => {
    mocks.useCaptureHotkey(args);
  },
}));

vi.mock('./CaptureModal', () => ({
  CaptureModal: () => null,
}));

import { CaptureHotkeyHost } from './CaptureHotkeyHost';

function queryResult(extra: Record<string, unknown>) {
  return {
    isSuccess: false,
    data: undefined,
    isUnavailable: false,
    isContractMismatch: false,
    ...extra,
  };
}

describe('CaptureHotkeyHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries core.settings.get for the cerebrum capture hotkey setting', () => {
    mocks.query.mockReturnValue(queryResult({}));
    render(<CaptureHotkeyHost />);
    expect(mocks.query).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['settings', 'get'],
      input: { key: 'cerebrum.captureHotkey' },
    });
  });

  it('keeps the hotkey unbound while the query is still loading', () => {
    mocks.query.mockReturnValue(queryResult({}));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });

  it('binds the configured hotkey once the query resolves', () => {
    mocks.query.mockReturnValue(queryResult({ isSuccess: true, data: { data: { value: ' g ' } } }));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'g', enabled: true })
    );
  });

  it('falls back to the default hotkey when the resolved value is null', () => {
    mocks.query.mockReturnValue(queryResult({ isSuccess: true, data: { data: null } }));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'c', enabled: true })
    );
  });

  it('falls back to the default hotkey when the core pillar is unavailable', () => {
    mocks.query.mockReturnValue(queryResult({ isUnavailable: true }));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'c', enabled: true })
    );
  });

  it('falls back to the default hotkey on contract mismatch', () => {
    mocks.query.mockReturnValue(queryResult({ isContractMismatch: true }));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'c', enabled: true })
    );
  });
});
