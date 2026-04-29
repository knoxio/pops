/**
 * @pops/app-cerebrum — Cerebrum (knowledge) app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load cerebrum pages under /cerebrum/*.
 *
 * ChatPanel and useChatPageModel are also exported so the shell can
 * embed the chat UI in the global CerebrumChatOverlay (fixes #2408).
 */
export { navConfig, routes } from './routes';
export { ChatPanel } from './components/chat/ChatPanel';
export { useChatPageModel } from './pages/chat-page/useChatPageModel';
