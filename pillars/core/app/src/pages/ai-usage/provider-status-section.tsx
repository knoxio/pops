import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Skeleton } from '@pops/ui';

import { unwrap } from '../../core-api-helpers.js';
import { aiProvidersHealthCheck, aiProvidersList } from '../../core-api/index.js';
import { ProviderCard } from './provider-card';

import type {
  AiProvidersHealthCheckResponse,
  AiProvidersListResponse,
} from '../../core-api/types.gen.js';

export function ProviderStatusSection() {
  const queryClient = useQueryClient();
  const { data: providers, isLoading } = useQuery<AiProvidersListResponse>({
    queryKey: ['core', 'aiProviders', 'list'],
    queryFn: async () => unwrap(await aiProvidersList()),
  });

  const healthCheckMutation = useMutation<AiProvidersHealthCheckResponse, Error, string>({
    mutationFn: async (providerId) =>
      unwrap(await aiProvidersHealthCheck({ path: { providerId } })),
    onSuccess: (result) => {
      if (result.status === 'active') {
        toast.success(`Provider healthy (${result.latencyMs}ms)`);
      } else {
        toast.error(`Provider unhealthy: ${result.error ?? 'unknown error'}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['core', 'aiProviders'] });
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
            onCheck={(providerId) => healthCheckMutation.mutate(providerId)}
            isChecking={healthCheckMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
