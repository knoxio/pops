import { Clock } from 'lucide-react';

import { Badge, Card } from '@pops/ui';

type SlowQuery = {
  id: number | string;
  model: string;
  operation: string;
  contextId: string | null;
  latencyMs: number;
};

export function SlowQueriesCard({ queries }: { queries: SlowQuery[] }) {
  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-500" />
        Slow Queries
      </h3>
      <div className="space-y-2">
        {queries.map((q) => (
          <div key={q.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-mono text-xs text-muted-foreground">{q.model}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">{q.operation}</span>
            </div>
            <div className="flex items-center gap-3">
              {q.contextId && (
                <span className="text-xs text-muted-foreground font-mono">
                  {q.contextId.slice(0, 8)}…
                </span>
              )}
              <Badge variant="destructive" className="tabular-nums">
                {q.latencyMs.toLocaleString()}ms
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
