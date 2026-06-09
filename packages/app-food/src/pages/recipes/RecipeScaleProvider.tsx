import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface RecipeScaleContextValue {
  scaleFactor: number;
  setScaleFactor: (next: number) => void;
}

const RecipeScaleContext = createContext<RecipeScaleContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  initialScaleFactor?: number;
}

/**
 * Context shell for recipe-page scale state — PRD-119 B + amendments from
 * PRD-142 (send to shopping list) and PRD-144 (cook now). The detail page
 * mounts the provider; downstream PRDs consume `useRecipeScale()` to
 * scale the ingredient list, send a scaled list to a shopping list, or
 * pre-fill the cook modal.
 *
 * v1 ships scaleFactor=1 and a setter that downstream PRDs will wire to
 * a `<ScalePicker>` — no UI for changing scale yet (PRD-119 spec). The
 * provider is forward-compat scaffolding so 142 / 144 plug in without a
 * follow-up refactor of the detail page.
 */
export function RecipeScaleProvider({
  children,
  initialScaleFactor = 1,
}: ProviderProps): ReactElement {
  const [scaleFactor, setScaleFactor] = useState(initialScaleFactor);
  const value = useMemo(() => ({ scaleFactor, setScaleFactor }), [scaleFactor]);
  return <RecipeScaleContext.Provider value={value}>{children}</RecipeScaleContext.Provider>;
}

export function useRecipeScale(): RecipeScaleContextValue {
  const ctx = useContext(RecipeScaleContext);
  if (ctx === null) {
    throw new Error('useRecipeScale must be used inside a RecipeScaleProvider');
  }
  return ctx;
}
