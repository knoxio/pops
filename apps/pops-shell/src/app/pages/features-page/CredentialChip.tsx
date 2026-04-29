import { CheckCircle2, Database, ServerCog, XCircle } from 'lucide-react';

import { cn } from '@pops/ui';

import type { FeatureCredentialStatus } from '@pops/types';

interface CredentialChipProps {
  credential: FeatureCredentialStatus;
}

/**
 * Per-credential status pill rendered next to a feature toggle. Communicates
 * three resolution outcomes:
 *  - configured (DB) — green
 *  - configured via env — blue
 *  - missing — red
 */
export function CredentialChip({ credential }: CredentialChipProps) {
  if (credential.source === 'database') {
    return (
      <span className={chipClass('ok')}>
        <CheckCircle2 className="h-3 w-3" />
        <Database className="h-3 w-3 opacity-70" />
        {credential.key}
      </span>
    );
  }

  if (credential.source === 'environment') {
    return (
      <span className={chipClass('env')}>
        <CheckCircle2 className="h-3 w-3" />
        <ServerCog className="h-3 w-3 opacity-70" />
        {credential.envVar ?? credential.key}
      </span>
    );
  }

  return (
    <span className={chipClass('missing')}>
      <XCircle className="h-3 w-3" />
      {credential.envVar ?? credential.key}
    </span>
  );
}

function chipClass(state: 'ok' | 'env' | 'missing'): string {
  return cn(
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border font-medium',
    state === 'ok' &&
      'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
    state === 'env' && 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
    state === 'missing' && 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400'
  );
}
