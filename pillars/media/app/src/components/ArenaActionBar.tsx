import { ResponsiveActionBar, type ResponsiveActionBarProps } from '@pops/ui';

/**
 * Compare-arena wrapper around `ResponsiveActionBar` from `@pops/ui`.
 * Defaults the root `data-testid` to `arena-action-bar`; pass `dataTestId` to override.
 */
export type {
  ResponsiveActionBarMovie as ArenaMovie,
  ResponsiveActionBarProps as ArenaActionBarProps,
} from '@pops/ui';

export function ArenaActionBar({
  dataTestId = 'arena-action-bar',
  ...rest
}: ResponsiveActionBarProps) {
  return <ResponsiveActionBar dataTestId={dataTestId} {...rest} />;
}
