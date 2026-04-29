import { Link } from 'react-router';

import { Switch } from '@pops/ui';

import { CredentialChip } from './CredentialChip';
import { FeatureCardHeader } from './FeatureCardHeader';
import { useFeatureMutations } from './use-feature-mutations';

import type { FeatureStatus } from '@pops/types';

export function FeatureCard({ feature }: { feature: FeatureStatus }) {
  const { toggle, resetUserOverride, errorMessage, pending } = useFeatureMutations(feature);

  const credentialMissing = feature.credentials.some((c) => c.source === 'missing');
  const isCapability = feature.scope === 'capability';
  const isUserScoped = feature.scope === 'user';
  const toggleDisabled =
    isCapability || credentialMissing || feature.capabilityMissing === true || pending;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <FeatureCardHeader feature={feature} />
        {!isCapability && (
          <Switch
            checked={feature.enabled}
            disabled={toggleDisabled}
            onCheckedChange={toggle}
            aria-label={`Toggle ${feature.label}`}
          />
        )}
      </div>

      {feature.credentials.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {feature.credentials.map((credential) => (
            <CredentialChip key={credential.key} credential={credential} />
          ))}
        </div>
      )}

      {credentialMissing && feature.configureLink && (
        <p className="text-xs text-muted-foreground">
          Missing credentials —{' '}
          <Link to={feature.configureLink} className="text-app-accent underline">
            configure them in Settings
          </Link>
          .
        </p>
      )}

      {isUserScoped && feature.userOverride && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={resetUserOverride}
        >
          Reset to default
        </button>
      )}

      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  );
}
