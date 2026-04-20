import { Alert, Button, PageHeader } from '@pops/ui';

type RulesErrorStateProps = {
  onRetry: () => void;
};

export function RulesErrorState({ onRetry }: RulesErrorStateProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorisation Rules"
        description="Browse and manage AI categorisation rules"
      />
      <Alert variant="destructive">
        <h3 className="font-semibold">Failed to load rules</h3>
        <p className="text-sm mt-1">Something went wrong loading categorisation rules.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      </Alert>
    </div>
  );
}
