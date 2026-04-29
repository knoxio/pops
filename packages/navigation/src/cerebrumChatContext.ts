/**
 * CerebrumChat context — lets any app package open the global Cerebrum chat
 * overlay without a direct dependency on the shell's UI store.
 *
 * The shell mounts CerebrumChatProvider around RootLayout and wires it to the
 * UI store. App packages (e.g. app-media) call useCerebrumChat().openChat()
 * to trigger the overlay from anywhere in the tree.
 */
import { createContext, useContext } from 'react';

export interface CerebrumChatContextValue {
  openChat: () => void;
}

export const CerebrumChatCtx = createContext<CerebrumChatContextValue>({
  // Default is a no-op — safe if the provider is not mounted.
  openChat: () => {},
});

CerebrumChatCtx.displayName = 'CerebrumChat';

/** Returns the openChat callback from the nearest CerebrumChatProvider. */
export function useCerebrumChat(): CerebrumChatContextValue {
  return useContext(CerebrumChatCtx);
}
