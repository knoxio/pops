/**
 * @pops/overlay-ego — Ego dual-surface module (PRD-099).
 *
 * Exports:
 * - `manifest`        — ModuleManifest with surfaces: ['overlay', 'app']
 * - `EgoOverlay`      — the floating chat panel (mounted in shell chrome)
 * - `EgoFab`          — the FAB that toggles the overlay
 * - `ChatPanel`       — embedable chat panel (used by /cerebrum/chat too)
 * - `useChatPageModel`— hook that drives ChatPanel; conversation state lives
 *                       in tRPC ego.* queries, so overlay and route share it
 */
export { ChatPanel } from './chat-components/ChatPanel';
export { useChatPageModel } from './chat-hooks/useChatPageModel';
export type { ChatMessage, ChatPageModel, ConversationSummary } from './chat-hooks/types';
export { EgoFab } from './EgoFab';
export type { EgoFabProps } from './EgoFab';
export { EgoOverlay } from './EgoOverlay';
export type { EgoOverlayProps } from './EgoOverlay';
export { EGO_OVERLAY_CHROME_SLOT, EGO_OVERLAY_SHORTCUT, manifest } from './manifest';
