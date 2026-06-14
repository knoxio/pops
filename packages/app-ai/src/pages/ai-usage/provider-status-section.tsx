import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';
import { Skeleton } from '@pops/ui';

import { ProviderCard } from './provider-card';

interface ProviderModel {
  id: number;
  modelId: string;
  displayName: string | null;
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  contextWindow: number | null;
  isDefault: boolean;
}

interface Provider {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  apiKeyRef: string | null;
  status: string;
  lastHealthCheck: string | null;
  lastLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
  models: ProviderModel[];
}

interface HealthCheckInput {
  providerId: string;
}

interface HealthCheckResult {
  status: 'active' | 'error';
  latencyMs: number;
  error?: string;
}

export function ProviderStatusSection() {
  const utils = usePillarUtils('core');
  const { data: providers, isLoading } = usePillarQuery<Provider[]>(
    'core',
    ['aiProviders', 'list'],
    undefined
  );

  const healthCheckMutation = usePillarMutation<HealthCheckInput, HealthCheckResult>(
    'core',
    ['aiProviders', 'healthCheck'],
    {
      onSuccess: (result) => {
        if (result.status === 'active') {
          toast.success(`Provider healthy (${result.latencyMs}ms)`);
        } else {
          toast.error(`Provider unhealthy: ${result.error ?? 'unknown error'}`);
        }
        void utils.invalidate(['aiProviders', 'list']);
      },
      onError: () => toast.error('Health check failed'),
    }
  );

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
