/**
 * Wire-derived view types for the inbox inspector (PRD-135).
 *
 * All projected from the generated food SDK's `inbox.getForReview`
 * response so the inspector UI stays in lockstep with the REST surface.
 * `InspectorResult` is the raw discriminated union; the rest narrow into
 * its `ok: true` member.
 */
import type { InboxGetForReviewResponses } from '../../../food-api/types.gen.js';

export type InspectorResult = InboxGetForReviewResponses[200];

type InspectorOk = Extract<InspectorResult, { ok: true }>;

export type InspectorReviewView = InspectorOk['review'];
export type InspectorSourceView = InspectorReviewView['source'];
export type InspectorDraftView = NonNullable<InspectorReviewView['draft']>;
export type InspectorProposedSlugRow = InspectorDraftView['proposedSlugs'][number];
export type InspectorResolverCreationRow = InspectorDraftView['creations'][number];
export type QualityResult = InspectorDraftView['quality'];
