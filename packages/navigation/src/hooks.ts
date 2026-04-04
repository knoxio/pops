import { useContext } from "react";
import { AppContextCtx } from "./context.js";
import type { AppContext } from "./types.js";

/**
 * Returns the current AppContext.
 *
 * Must be used inside an AppContextProvider.
 */
export function useAppContext(): AppContext {
  return useContext(AppContextCtx).context;
}
