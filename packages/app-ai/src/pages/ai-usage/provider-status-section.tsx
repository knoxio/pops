import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Skeleton } from '@pops/ui';

import { ProviderCard } from './provider-card';

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
          <ProviderCard
            key={p.id}
            provider={p}
            onCheck={(providerId) => healthCheckMutation.mutate({ providerId })}
            isChecking={healthCheckMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
