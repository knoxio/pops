/**
 * Cerebrum domain — engram storage and retrieval.
 * See docs/themes/06-cerebrum for the full spec.
 */
import { router } from '../../trpc.js';
import { engramsRouter } from './engrams/router.js';
import { templatesRouter } from './templates/router.js';

export const cerebrumRouter = router({
  engrams: engramsRouter,
  templates: templatesRouter,
});
