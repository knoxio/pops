import { FeatureStatePill } from './FeatureStatePill';

import type { FeatureStatus } from '@pops/types';

export function FeatureCardHeader({ feature }: { feature: FeatureStatus }) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">{feature.label}</h3>
        <FeatureStatePill state={feature.state} />
        {feature.preview && (
          <span className="text-[11px] uppercase tracking-wide text-violet-500">Preview</span>
        )}
        {feature.deprecated && (
          <span className="text-[11px] uppercase tracking-wide text-amber-500">Deprecated</span>
        )}
        {feature.scope === 'user' && feature.userOverride && (
          <span className="text-[11px] uppercase tracking-wide text-sky-500">Custom</span>
        )}
      </div>
      {feature.description && (
        <p className="text-xs text-muted-foreground">{feature.description}</p>
      )}
    </div>
  );
}
