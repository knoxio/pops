import type { SettingsField } from '@pops/types';

export type TestState = 'idle' | 'loading' | 'success' | 'error';
export type SaveState = 'idle' | 'saving' | 'saved';

export interface FieldProps {
  field: SettingsField;
  value: string;
  onChange: (key: string, value: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  isOptionsLoading?: boolean;
}
