import { describe, expect, it } from 'vitest';

import { initialState } from '../../store/import-store-types';
import { useImportStore } from '../../store/importStore';
import { firstImportStep, importStepLabel, importStepsFor } from './step-labels';

describe('importStepsFor', () => {
  it('a file run has every step; a live draft starts at Process', () => {
    expect(importStepsFor(null)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(importStepsFor({ kind: 'file', dialectId: 'Amex', fileNames: ['a.csv'] })).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(importStepsFor({ kind: 'live', provider: 'up' })).toEqual([3, 4, 5, 6, 7, 8]);
    expect(firstImportStep({ kind: 'live', provider: 'up' })).toBe(3);
  });

  it('labels steps by number and nothing for an unknown one', () => {
    expect(importStepLabel(4)).toBe('Review');
    expect(importStepLabel(null)).toBeNull();
    expect(importStepLabel(9)).toBeNull();
  });
});

describe("the store never goes back past a live draft's first step", () => {
  it('Back from Process stays on Process for a live draft and reaches Map for a file draft', () => {
    useImportStore.setState({
      ...initialState,
      currentStep: 3,
      draftSource: { kind: 'live', provider: 'up' },
    });
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(3);
    useImportStore.getState().goToStep(1);
    expect(useImportStore.getState().currentStep).toBe(3);

    useImportStore.setState({ ...initialState, currentStep: 3 });
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(2);
  });
});
