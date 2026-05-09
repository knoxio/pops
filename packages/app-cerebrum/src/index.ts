/**
 * @pops/app-cerebrum — Cerebrum (knowledge) app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load cerebrum pages under /cerebrum/*.
 */
export { navConfig, routes } from './routes';
export { manifest } from './manifest';

// Backwards-compat re-exports — the chat panel + page model live in
// @pops/overlay-ego now (PRD-099). External consumers that imported
// these from @pops/app-cerebrum continue to work.
export { ChatPanel, useChatPageModel } from '@pops/overlay-ego';
