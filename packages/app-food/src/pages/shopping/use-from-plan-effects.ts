/**
 * URL sync + list-name auto-default for the FromPlanPage — extracted so
 * the page component stays under the per-function lint cap.
 */
import { useEffect } from 'react';
import { type SetURLSearchParams } from 'react-router';

import { defaultListName } from './default-list-name.js';

export interface FromPlanEffectsArgs {
  startDate: string;
  endDate: string;
  setParams: SetURLSearchParams;
  listNameDirty: boolean;
  setListName: (next: string) => void;
}

export function useFromPlanEffects(args: FromPlanEffectsArgs): void {
  const { startDate, endDate, setParams, listNameDirty, setListName } = args;
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('start', startDate);
        next.set('end', endDate);
        return next;
      },
      { replace: true }
    );
  }, [startDate, endDate, setParams]);
  useEffect(() => {
    if (!listNameDirty) setListName(defaultListName(startDate, endDate));
  }, [startDate, endDate, listNameDirty, setListName]);
}
