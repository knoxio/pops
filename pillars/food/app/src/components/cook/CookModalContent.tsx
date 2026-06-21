import { ConsumePreviewPanel } from './ConsumePreviewPanel.js';
import { deriveAutoExpires, type CookFormState } from './cook-modal-helpers.js';
import { CookModalFields } from './CookModalFields.js';
import { CookModalYieldFields } from './CookModalYieldFields.js';
import { ShortfallList } from './ShortfallList.js';

/**
 * Body of the cook modal — PRD-144.
 *
 * Hosts the scale + rating + notes fields, the yield-section fields
 * (when applicable), and the PRD-146 stub panels (`ConsumePreviewPanel`,
 * `ShortfallList`). Split out of `CookModal.tsx` to stay under the
 * per-file lint cap; the parent owns the dialog framing + state.
 */
import type { Dispatch, ReactElement, SetStateAction } from 'react';

import type { CookPreparation } from './cook-resolution-types.js';
import type { useCookResolution } from './useCookResolution.js';

interface Props {
  prep: CookPreparation;
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
  resolution: ReturnType<typeof useCookResolution>;
  recipeVersionId: number;
  errorMessage: string | null;
}

export function CookModalContent({
  prep,
  form,
  setForm,
  resolution,
  recipeVersionId,
  errorMessage,
}: Props): ReactElement {
  return (
    <div className="space-y-4">
      <CookModalFields form={form} setForm={setForm} />
      {prep.yieldsBatch ? (
        <CookModalYieldFields
          form={form}
          setForm={setForm}
          onLocationChange={(loc) =>
            setForm((prev) => ({
              ...prev,
              location: loc,
              // Only freeze the expiry when the user has manually edited
              // the expires field itself (Copilot R1). Earlier `dirty`-
              // based gating would lock auto-expiry after the very first
              // location toggle.
              expiresAt: prev.expiresAtDirty
                ? prev.expiresAt
                : deriveAutoExpires(prep.yieldDefault, loc),
              dirty: true,
            }))
          }
        />
      ) : null}
      <ConsumePreviewPanel
        lineNeeds={prep.consumeNeeds}
        resolutionMap={resolution.resolutionMap}
        hasShortfalls={false}
      />
      <ShortfallList
        shortfalls={[]}
        needsByLine={resolution.needsByLine}
        resolutionMap={resolution.resolutionMap}
        recipeVersionId={recipeVersionId}
        onResolve={resolution.setResolution}
        scaleResetSignal={resolution.scaleResetSignal}
      />
      {errorMessage !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
