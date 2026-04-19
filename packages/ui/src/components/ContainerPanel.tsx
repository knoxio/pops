import * as React from 'react';

import { cn } from '../lib/utils';
import { Label } from '../primitives/label';
import { Switch } from '../primitives/switch';

export interface ContainerPanelToggle {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  id?: string;
}

export interface ContainerPanelProps {
  title: string;
  subtitle?: string;
  toggle?: ContainerPanelToggle;
  summary?: React.ReactNode;
  action?: React.ReactNode;
  emptyState?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function ContainerPanel({
  title,
  subtitle,
  toggle,
  summary,
  action,
  emptyState,
  children,
  className,
}: ContainerPanelProps) {
  const generatedToggleId = React.useId();
  const toggleId = toggle?.id ?? generatedToggleId;

  return (
    <div className={cn('border rounded-lg p-4 space-y-4', className)}>
      <div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <h2 className="text-lg font-semibold mt-1">{title}</h2>
      </div>

      {toggle && (
        <div className="flex items-center gap-2">
          <Switch id={toggleId} checked={toggle.value} onCheckedChange={toggle.onChange} />
          <Label htmlFor={toggleId} className="text-sm">
            {toggle.label}
          </Label>
        </div>
      )}

      {summary !== undefined && <div className="text-sm text-muted-foreground">{summary}</div>}

      {children ?? emptyState ?? null}

      {action && <div>{action}</div>}
    </div>
  );
}
