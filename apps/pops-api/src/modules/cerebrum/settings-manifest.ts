import { emitGroup, queryGroup } from './settings/query-emit-manifest.js';
import { ingestGroup, retrievalGroup } from './settings/retrieval-ingest-manifest.js';
import {
  engramsGroup,
  gliaGroup,
  mcpGroup,
  nudgesGroup,
  plexusGroup,
  thalamusGroup,
} from './settings/subsystem-manifest.js';

/**
 * Cerebrum settings manifest — assembled from domain-specific group files
 * to stay under the max-lines lint rule.
 */
import type { SettingsManifest } from '@pops/types';

export const cerebrumManifest: SettingsManifest = {
  id: 'cerebrum',
  title: 'Cerebrum',
  icon: 'Brain',
  order: 300,
  groups: [
    queryGroup,
    emitGroup,
    retrievalGroup,
    ingestGroup,
    nudgesGroup,
    engramsGroup,
    plexusGroup,
    thalamusGroup,
    gliaGroup,
    mcpGroup,
  ],
};
