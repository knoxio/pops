export type SettingsFieldKind =
  | 'text'
  | 'number'
  | 'toggle'
  | 'select'
  | 'password'
  | 'json'
  | 'duration'
  | 'textarea';

export interface SettingsOption {
  value: string;
  label: string;
}

export interface SettingsField {
  id: string;
  kind: SettingsFieldKind;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: SettingsOption[];
  loadOptions?: () => Promise<SettingsOption[]>;
  validate?: (value: unknown, values: Record<string, unknown>) => string | null;
  min?: number;
  max?: number;
  defaultValue?: unknown;
  envFallbackLabel?: string;
}

export interface SettingsTestAction {
  id: string;
  label: string;
  run: (values: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>;
}

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
  testActions?: SettingsTestAction[];
}
