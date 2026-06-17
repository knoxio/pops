/**
 * Handlers for the rotation candidate-queue + exclusion-list routes.
 *
 * Thin wrappers over the `@pops/media` rotation services + the
 * download-candidate orchestration. Db domain errors are translated to the
 * shared HttpError subclasses via `guardRotation`; `runHttp` then maps those
 * to typed response envelopes.
 */
import {
  type MediaDb,
  rotationCandidatesService,
  rotationExclusionsService,
} from '../../db/index.js';
import { downloadCandidate } from '../modules/rotation-download-candidate.js';
import { runHttp } from './error-mapping.js';
import { guardRotation } from './rotation-handlers-shared.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaRotationContract } from '../../contract/rest-rotation.js';

type Req = ServerInferRequest<typeof mediaRotationContract>;

export function makeRotationCandidateHandlers(db: MediaDb) {
  return {
    addToQueue: ({ body }: Req['addToQueue']) =>
      runHttp(() =>
        guardRotation(() => {
          rotationCandidatesService.addToQueue(db, body);
          return { status: 200 as const, body: { message: 'Added to rotation queue' } };
        })
      ),

    listCandidates: ({ query }: Req['listCandidates']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationCandidatesService.listCandidates(db, query) },
      })),

    getCandidateStatus: ({ params }: Req['getCandidateStatus']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationCandidatesService.getCandidateStatus(db, params.tmdbId) },
      })),

    removeFromQueue: ({ params }: Req['removeFromQueue']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: { success: rotationCandidatesService.removeFromQueue(db, params.tmdbId) } },
      })),

    downloadCandidate: ({ params }: Req['downloadCandidate']) =>
      runHttp(() =>
        guardRotation(async () => ({
          status: 200 as const,
          body: { data: await downloadCandidate(db, params.candidateId) },
        }))
      ),

    addExclusion: ({ body }: Req['addExclusion']) =>
      runHttp(() => {
        rotationExclusionsService.addExclusion(db, body);
        return { status: 200 as const, body: { message: 'Excluded from rotation' } };
      }),

    getExclusion: ({ params }: Req['getExclusion']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationExclusionsService.getExclusion(db, params.tmdbId) },
      })),

    removeExclusion: ({ params }: Req['removeExclusion']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: { success: rotationExclusionsService.removeExclusion(db, params.tmdbId) } },
      })),
  };
}
