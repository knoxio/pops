import { useCallback, useState } from 'react';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { SETTINGS_KEYS } from '@pops/types';

import { CaptureModal } from './CaptureModal';
import { useCaptureHotkey } from './useCaptureHotkey';

const settingKey = SETTINGS_KEYS.CEREBRUM_CAPTURE_HOTKEY;
const defaultHotkey = 'c';

type SettingGetResult = {
  data: { value: string | null } | null;
};

interface HotkeyQueryShape {
  isSuccess: boolean;
  isUnavailable: boolean;
  isContractMismatch: boolean;
  data: SettingGetResult | undefined;
}

function resolveHotkey(q: HotkeyQueryShape): string {
  if (q.isUnavailable || q.isContractMismatch) return defaultHotkey;
  if (!q.isSuccess) return '';
  return (q.data?.data?.value ?? defaultHotkey).trim();
}

export function CaptureHotkeyHost() {
  const [open, setOpen] = useState(false);
  const settingQuery = usePillarQuery<SettingGetResult>('core', ['settings', 'get'], {
    key: settingKey,
  });
  // Wait for the setting to resolve before binding — otherwise a user who
  // configured an empty hotkey would briefly trigger on the default 'c'.
  // When the SDK reports the core pillar as unavailable or the contract
  // has drifted, fall back to the default hotkey so capture still works.
  const hotkey = resolveHotkey(settingQuery);

  const onTrigger = useCallback(() => setOpen(true), []);
  useCaptureHotkey({ key: hotkey, enabled: !open && hotkey.length > 0, onTrigger });

  return <CaptureModal open={open} onOpenChange={setOpen} />;
}
