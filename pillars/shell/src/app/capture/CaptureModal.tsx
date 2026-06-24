/**
 * CaptureModal — global capture surface rendered as a Dialog.
 *
 * Discovers the active capture overlay by walking the registry
 * (`activeCaptureOverlay()` over `installedFrontendManifests()` +
 * `WORKSPACE_BUNDLE_MAP`). The selection rule lives in
 * `./capture-registry.ts`; this file is responsible for:
 *
 *   - Mounting the resolved bundle's `Mount` component inside the
 *     dialog body.
 *   - Reading the descriptor's `labelKey` against the i18n catalog to
 *     title the dialog (falls back to the shell's generic
 *     `captureModal.title` when neither `labelKey` nor `label` is set).
 *   - Gating Esc / backdrop close on the bundle's unsaved-content
 *     signal — bundles that have no unsaved-content notion simply
 *     never call `onUnsavedChange`, and the modal closes
 *     unconditionally.
 *   - Falling back to an empty surface when no manifest contributes a
 *     `captureOverlay` (the active-overlay helper logs the structured
 *     warning).
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pops/ui';

import { activeCaptureOverlay, type ActiveCaptureOverlay } from './capture-registry';

import type { ModuleCaptureOverlayConfig } from '@pops/types';

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Test-only override: skip the live registry walk and mount the
   * supplied overlay verbatim. Production callers leave this unset.
   */
  activeOverlayOverride?: ActiveCaptureOverlay | null;
}

/**
 * The descriptor's `labelKey` is wire-shaped (e.g.
 * `'cerebrum.captureOverlay.label'`) — the first segment is the i18n
 * namespace, the rest is the key. Splitting here keeps each contributing
 * pillar's catalog ownership intact without coupling the shell to any
 * one namespace.
 */
function splitLabelKey(labelKey: string): { ns: string; key: string } | null {
  const dot = labelKey.indexOf('.');
  if (dot <= 0 || dot === labelKey.length - 1) return null;
  return { ns: labelKey.slice(0, dot), key: labelKey.slice(dot + 1) };
}

function resolveTitle(
  descriptor: ModuleCaptureOverlayConfig | undefined,
  fallback: string,
  t: (ns: string, key: string, defaultValue: string) => string
): string {
  if (descriptor === undefined) return fallback;
  if (descriptor.labelKey !== undefined) {
    const split = splitLabelKey(descriptor.labelKey);
    if (split !== null) return t(split.ns, split.key, descriptor.label ?? fallback);
  }
  if (descriptor.label !== undefined) return descriptor.label;
  return fallback;
}

export function CaptureModal({ open, onOpenChange, activeOverlayOverride }: CaptureModalProps) {
  const { i18n, t: shellT } = useTranslation('shell');
  const overlay = useMemo<ActiveCaptureOverlay | null>(
    () => (activeOverlayOverride !== undefined ? activeOverlayOverride : activeCaptureOverlay()),
    [activeOverlayOverride]
  );
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const onUnsavedChange = useCallback((next: boolean) => {
    setHasUnsaved(next);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && hasUnsaved) return;
      onOpenChange(next);
    },
    [hasUnsaved, onOpenChange]
  );

  const title = resolveTitle(
    overlay?.descriptor,
    shellT('captureModal.title'),
    (ns, key, defaultValue) => i18n.t(key, { ns, defaultValue })
  );
  const Mount = overlay?.bundle.Mount;
  const description = overlay === null ? shellT('captureModal.empty') : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (hasUnsaved) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {Mount !== undefined ? <Mount onUnsavedChange={onUnsavedChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}
