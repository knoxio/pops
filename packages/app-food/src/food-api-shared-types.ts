/**
 * Shared wire-derived unions used across multiple food FE features.
 *
 * Every alias here is projected from the generated food SDK
 * (`src/food-api/`) so the FE's enums stay in lockstep with the pillar's
 * REST surface. Define a union ONCE here when it is needed in several
 * files; one-off response shapes belong next to their consumer.
 */
import type {
  BatchesAdjustQtyData,
  BatchesCreateData,
  BatchesGetResponses,
  InboxListResponses,
  InboxRejectData,
  SubstitutionsCreateData,
} from './food-api/types.gen.js';

type BatchData = BatchesGetResponses[200]['data'];

export type BatchLocation = BatchData['location'];
export type BatchUnit = BatchData['unit'];
export type ManualBatchSourceType = NonNullable<BatchesCreateData['body']>['sourceType'];
export type BatchAdjustReason = NonNullable<BatchesAdjustQtyData['body']>['reason'];

type InboxDraftItem = InboxListResponses[200]['items'][number];

export type IngestSourceKind = InboxDraftItem['ingestKind'];
export type QualityBand = InboxDraftItem['qualityBand'];

export type RejectionReason = NonNullable<InboxRejectData['body']>['reason'];

export type SubstitutionScope = NonNullable<SubstitutionsCreateData['body']>['scope'];
