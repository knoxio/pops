/**
 * @pops/app-cerebrum — Cerebrum (knowledge) app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load cerebrum pages under /cerebrum/*.
 *
 * Also exports the ChatPanel component and useChatPageModel hook so the shell
 * can mount the global Cerebrum chat overlay from any page.
 */
export { navConfig, routes } from './routes';
export { ChatPanel } from './components/chat/ChatPanel';
export { useChatPageModel } from './pages/chat-page/useChatPageModel';
