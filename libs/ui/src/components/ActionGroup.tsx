import { cn } from '../lib/utils';

import type { HTMLAttributes } from 'react';

export type ActionGroupProps = HTMLAttributes<HTMLDivElement>;

/** Tight horizontal cluster for stacked media actions (e.g. poster overlays). */
export function ActionGroup({ className, ...rest }: ActionGroupProps) {
  return <div className={cn('flex flex-wrap items-center gap-1', className)} {...rest} />;
}

ActionGroup.displayName = 'ActionGroup';

/** @deprecated Use {@link ActionGroup} instead. */
export type ConditionalActionGroupProps = ActionGroupProps;

/** @deprecated Use {@link ActionGroup} instead. */
export function ConditionalActionGroup(props: ActionGroupProps) {
  return <ActionGroup {...props} />;
}

ConditionalActionGroup.displayName = 'ConditionalActionGroup';
