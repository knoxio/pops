import { trpc } from '@/lib/trpc';
import { useCallback, useState } from 'react';

import { CaptureModal } from './CaptureModal';
import { useCaptureHotkey } from './useCaptureHotkey';

const settingKey = 'cerebrum.captureHotkey' as const;
const defaultHotkey = 'c';

export function CaptureHotkeyHost() {
  const [open, setOpen] = useState(false);
  const settingQuery = trpc.core.settings.get.useQuery({ key: settingKey });
  // Wait for the setting to resolve before binding — otherwise a user who
  // configured an empty hotkey would briefly trigger on the default 'c'.
  const hotkey = settingQuery.isSuccess
    ? (settingQuery.data?.data?.value ?? defaultHotkey).trim()
    : '';

  const onTrigger = useCallback(() => setOpen(true), []);
  useCaptureHotkey({ key: hotkey, enabled: !open && hotkey.length > 0, onTrigger });

  return <CaptureModal open={open} onOpenChange={setOpen} />;
}
