import { useUIStore } from '@/store/uiStore';
/**
 * Tests for `OverlayHost` (PRD-101 US-07).
 *
 * Two scenarios:
 *   1. Default — ego overlay is in `installedOverlays`; mounting the host
 *      results in the lazy ego component being loaded and the `aside`
 *      element rendered into the DOM after Suspense resolves.
 *   2. Empty install set (simulates `POPS_OVERLAYS=`) — the registry module
 *      is mocked to return no overlays; the host renders nothing.
 *
 * The OverlayHost does not mount the FAB; that's `RootLayout`'s job. We
 * only assert overlay presence/absence in the DOM.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

describe('OverlayHost — with ego installed (default)', () => {
  it('lazy-loads the ego overlay component and mounts the assistant slot dialog', async () => {
    // Leave the overlay closed. The dialog shell still renders (only the
    // inner chat panel is conditional on `open`), so we can assert that
    // the lazy mount happened without standing up a tRPC context just for
    // the inner panel hooks.
    useUIStore.setState({ overlays: { ego: false } });

    const { OverlayHost } = await import('./OverlayHost');

    const { container } = render(
      <MemoryRouter>
        <OverlayHost />
      </MemoryRouter>
    );

    // Closed dialogs have aria-modal="false" so role-based queries skip
    // them. Match the aside element directly to assert the lazy mount.
    await waitFor(() => {
      expect(container.querySelector('aside[aria-label="Chat overlay"]')).not.toBeNull();
    });
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

    const { OverlayHost } = await import('./OverlayHost');

    const { container } = render(
      <MemoryRouter>
        <OverlayHost />
      </MemoryRouter>
    );

    // `aside` is the Ego overlay root; assert nothing is mounted.
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    vi.doUnmock('./registry');
    vi.resetModules();
  });
});
