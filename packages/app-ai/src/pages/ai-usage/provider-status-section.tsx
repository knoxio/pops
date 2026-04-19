import { AlertCircle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Badge, Button, Card, Skeleton } from '@pops/ui';

export function ProviderStatusSection() {
  const utils = trpc.useUtils();
  const { data: providers, isLoading } = trpc.core.aiProviders.list.useQuery();

  const healthCheckMutation = trpc.core.aiProviders.healthCheck.useMutation({
    onSuccess: (result) => {
      if (result.status === 'active') {
        toast.success(`Provider healthy (${result.latencyMs}ms)`);
      } else {
        toast.error(`Provider unhealthy: ${result.error ?? 'unknown error'}`);
      }
      void utils.core.aiProviders.list.invalidate();
    },
    onError: () => toast.error('Health check failed'),
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!providers?.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Providers</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.type}</p>
                </div>
              </div>
              <Badge
                variant={p.status === 'active' ? 'default' : 'destructive'}
                className="shrink-0"
              >
                {p.status === 'active' ? (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {p.status}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {p.models.length} model{p.models.length !== 1 ? 's' : ''}
                {p.lastLatencyMs != null && ` · ${p.lastLatencyMs}ms`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => healthCheckMutation.mutate({ providerId: p.id })}
                disabled={healthCheckMutation.isPending}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Check
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
