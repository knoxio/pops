/**
 * Settings manifest types — shared between API (registry) and frontend (renderer).
 */

export type SettingsFieldType =
  | 'text'
  | 'number'
  | 'toggle'
  | 'select'
  | 'password'
  | 'url'
  | 'duration'
  | 'json';

export interface SettingsField {
  key: string;
  label: string;
  description?: string;
  type: SettingsFieldType;
  default?: string;
  options?: { value: string; label: string }[];
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  envFallback?: string;
  sensitive?: boolean;
  requiresRestart?: boolean;
  testAction?: {
    procedure: string;
    label: string;
  };
}

export interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
}

export interface SettingsManifest {
  id: string;
  title: string;
  icon?: string;
  order: number;
  groups: SettingsGroup[];
}
