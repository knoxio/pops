/**
 * @pops/app-cerebrum — Cerebrum (knowledge) app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load cerebrum pages under /cerebrum/*.
 */
export { navConfig, routes } from './routes';
export { manifest } from './manifest';

// Capture surface — exported for the global hotkey modal in pops-shell
// (PRD-081 US-09).
export { IngestForm } from './components/IngestForm';
export { useIngestPageModel } from './pages/ingest-page/useIngestPageModel';

// Backwards-compat re-exports — the chat panel + page model live in
// @pops/overlay-ego now (PRD-099). External consumers that imported
// these from @pops/app-cerebrum continue to work.
export { ChatPanel, useChatPageModel } from '@pops/overlay-ego';
