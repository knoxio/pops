import { CheckCircle2, Loader2 } from 'lucide-react';

import { Badge, Label } from '@pops/ui';

import type { SettingsField } from '@pops/types';

import type { SaveState } from './types';

interface FieldWrapperProps {
  field: SettingsField;
  children: React.ReactNode;
  saveState?: SaveState;
}

export function FieldWrapper({ field, children, saveState }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">{field.label}</Label>
        {field.requiresRestart && (
          <Badge variant="outline" className="text-amber-500 border-amber-500 text-xs px-1.5 py-0">
            Requires restart
          </Badge>
        )}
        {saveState === 'saving' && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {saveState === 'saved' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
      </div>
      {children}
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
    </div>
  );
}

export function EnvLabel({ envVar }: { envVar: string }) {
  return <p className="text-xs text-muted-foreground">Using environment variable {envVar}</p>;
}
