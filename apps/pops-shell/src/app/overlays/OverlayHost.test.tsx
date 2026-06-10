import { useUIStore } from '@/store/uiStore';
/**
 * Tests for `OverlayHost` (PRD-101 US-07).
 *
 * Three scenarios:
 *   1. Default — an installed overlay declares the `assistant` slot;
 *      mounting the host for that slot results in the lazy component
 *      being loaded and its rendered output appearing after Suspense
 *      resolves.
 *   2. Non-matching slot — mounting the host for a different known slot
 *      (`notification`) must NOT render the overlay, proving that
 *      `chromeSlot` actually drives placement.
 *   3. Empty install set (simulates `POPS_OVERLAYS=`) — the registry module
 *      is mocked to return no overlays; the host renders nothing.
 *
 * Each test mocks `./registry` with a synthetic overlay rather than relying
 * on the real `@pops/overlay-ego` package. The real overlay drags Zustand,
 * tRPC, and a large chat surface into the cold-vitest module graph; loading
 * it on the first lazy-mount blows past the test timeout intermittently.
 * The slot-matching + Suspense-unwrap mechanics under test are the same
 * regardless of which component sits behind the loader.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Synthetic overlay shaped like an `InstalledOverlay` so it satisfies the
 *  `OverlayHost`'s mount path without pulling in any real overlay package. */
function fakeInstalledOverlay(slot: 'assistant' | 'notification' | 'command') {
  return {
    moduleId: 'fake',
    chromeSlot: slot,
    shortcut: undefined,
    loader: async () => ({
      default: () => <aside aria-label="Chat overlay">fake</aside>,
    }),
  };
}

describe('OverlayHost — with an overlay installed in the assistant slot', () => {
  beforeEach(() => {
    useUIStore.setState({ overlays: { fake: false } });
    vi.resetModules();
    vi.doMock('./registry', () => ({
      installedOverlays: [fakeInstalledOverlay('assistant')],
      selectInstalledOverlays: () => [fakeInstalledOverlay('assistant')],
      SHELL_OVERLAY_MANIFESTS: [],
    }));
  });

  afterEach(() => {
    vi.doUnmock('./registry');
    vi.resetModules();
  });

  it('lazy-loads the overlay into the assistant slot', async () => {
    const { OverlayHost } = await import('./OverlayHost');

    const { container } = render(
      <MemoryRouter>
        <OverlayHost slot="assistant" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.querySelector('aside[aria-label="Chat overlay"]')).not.toBeNull();
    });
  });

  it('does not mount the overlay into a non-matching slot', async () => {
    const { OverlayHost } = await import('./OverlayHost');

    const { container } = render(
      <MemoryRouter>
        <OverlayHost slot="notification" />
      </MemoryRouter>
    );

    // Give React a tick — if a lazy import had been kicked off, Suspense
    // would have resolved and the aside would appear. It must not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('aside[aria-label="Chat overlay"]')).toBeNull();
  });
});

describe('OverlayHost — with empty install set (POPS_OVERLAYS=)', () => {
  it('renders no overlay markup when no overlays are installed', async () => {
    vi.resetModules();
    vi.doMock('./registry', () => ({
      installedOverlays: [],
      selectInstalledOverlays: () => [],
      SHELL_OVERLAY_MANIFESTS: [],
    }));

    try {
      const { OverlayHost } = await import('./OverlayHost');

      const { container } = render(
        <MemoryRouter>
          <OverlayHost slot="assistant" />
        </MemoryRouter>
      );

      // `aside` is the Ego overlay root; assert nothing is mounted.
      expect(container.querySelector('aside')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      vi.doUnmock('./registry');
      vi.resetModules();
    }
  });
});
