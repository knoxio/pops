import { trpc } from '@/lib/trpc';
/**
 * CaptureHotkeyHost — mounts at the shell root (PRD-081 US-09). Reads the
 * configured capture hotkey, listens at the window level, and opens the
 * CaptureModal on press.
 */
import { useCallback, useState } from 'react';

import { CaptureModal } from './CaptureModal';
import { useCaptureHotkey } from './useCaptureHotkey';

const SETTING_KEY = 'cerebrum.captureHotkey' as const;
const DEFAULT_HOTKEY = 'c';

export function CaptureHotkeyHost() {
  const [open, setOpen] = useState(false);
  const settingQuery = trpc.core.settings.get.useQuery({ key: SETTING_KEY });
  // Wait for the setting to resolve before binding — otherwise a user who
  // configured an empty hotkey would briefly trigger on the default 'c'.
  const hotkey = settingQuery.isSuccess
    ? (settingQuery.data?.data?.value ?? DEFAULT_HOTKEY).trim()
    : '';

  const onTrigger = useCallback(() => setOpen(true), []);
  useCaptureHotkey({ key: hotkey, enabled: !open && hotkey.length > 0, onTrigger });

  return <CaptureModal open={open} onOpenChange={setOpen} />;
}
