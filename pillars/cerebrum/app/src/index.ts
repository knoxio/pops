/**
 * @pops/app-cerebrum — Cerebrum (knowledge) app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load cerebrum pages under /cerebrum/*.
 */
export { navConfig, routes } from './routes';
export { manifest } from './manifest';

export { IngestForm } from './components/IngestForm';
export { useIngestPageModel } from './pages/ingest-page/useIngestPageModel';

// The chat panel + page model live in @pops/overlay-ego; re-exported here
// so consumers can reach them through this barrel.
export { ChatPanel, useChatPageModel } from '@pops/overlay-ego';
