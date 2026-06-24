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
 * Context shell for recipe-page scale state. The detail page mounts the
 * provider; consumers call `useRecipeScale()` to scale the ingredient
 * list, send a scaled list to a shopping list, or pre-fill the cook
 * modal. No UI changes the scale yet — only the setter exists, defaulting
 * to scaleFactor=1.
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
