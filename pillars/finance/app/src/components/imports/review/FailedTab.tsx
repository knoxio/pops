import { EmptyStateTab } from '@pops/ui';

import { GroupedView, ListView, type ReviewTabBaseProps, ViewModeToggle } from './ReviewTabShared';

/**
 * Failed tab - needs user action
 */
export function FailedTab(props: ReviewTabBaseProps) {
  if (props.transactions.length === 0) {
    return <EmptyStateTab message="No failed transactions" />;
  }
  return (
    <div className="space-y-4">
      <ViewModeToggle viewMode={props.viewMode} onViewModeChange={props.onViewModeChange} />
      {props.viewMode === 'grouped' ? (
        <GroupedView variant="failed" props={props} />
      ) : (
        <ListView variant="failed" props={props} />
      )}
    </div>
  );
}
