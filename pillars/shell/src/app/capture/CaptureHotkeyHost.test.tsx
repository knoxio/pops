import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveCaptureOverlay } from './capture-registry';

const mocks = vi.hoisted(() => ({
  useCaptureHotkey: vi.fn(),
  activeCaptureOverlay: vi.fn<() => ActiveCaptureOverlay | null>(),
}));

vi.mock('./useCaptureHotkey', () => ({
  useCaptureHotkey: (args: { key: string; enabled: boolean; onTrigger: () => void }) => {
    mocks.useCaptureHotkey(args);
  },
}));

vi.mock('./capture-registry', async () => {
  const actual = await vi.importActual<typeof import('./capture-registry')>('./capture-registry');
  return {
    ...actual,
    activeCaptureOverlay: () => mocks.activeCaptureOverlay(),
  };
});

vi.mock('./CaptureModal', () => ({
  CaptureModal: () => null,
}));

import { CaptureHotkeyHost } from './CaptureHotkeyHost';

const FakeMount = () => null;

function syntheticOverlay(hotkey: string | undefined): ActiveCaptureOverlay {
  return {
    pillarId: 'cerebrum',
    descriptor: {
      bundleSlot: 'ingest-form',
      order: 10,
      hotkey,
      labelKey: 'cerebrum.captureOverlay.label',
    },
    bundle: { Mount: FakeMount },
  };
}

describe('CaptureHotkeyHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeCaptureOverlay.mockReturnValue(null);
  });

  it('binds the descriptor hotkey when an overlay is registered', () => {
    render(<CaptureHotkeyHost activeOverlayOverride={syntheticOverlay('cmd+shift+k')} />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'cmd+shift+k', enabled: true })
    );
  });

  it('keeps the hotkey unbound when no overlay is registered', () => {
    render(<CaptureHotkeyHost activeOverlayOverride={null} />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });

  it('keeps the hotkey unbound when the descriptor declares no hotkey', () => {
    render(<CaptureHotkeyHost activeOverlayOverride={syntheticOverlay(undefined)} />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });

  it('falls back to the live registry walk when no override is supplied', () => {
    mocks.activeCaptureOverlay.mockReturnValue(syntheticOverlay('cmd+shift+k'));
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'cmd+shift+k', enabled: true })
    );
  });

  it('renders empty when the registry walk reports no overlay', () => {
    mocks.activeCaptureOverlay.mockReturnValue(null);
    render(<CaptureHotkeyHost />);
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });
});
