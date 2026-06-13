import type { UsePillarMutationResult } from '@pops/pillar-sdk/react';

import type { BulkSegmentOutcome } from './types';

export interface QuickCapturePayload {
  text: string;
  source: 'manual';
  scopes?: string[];
}

export interface QuickCaptureResponse {
  id: string;
  path: string;
  type: string;
  scopes: string[];
}

export interface SubmitPayload {
  body: string;
  title?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  source: 'manual';
  customFields?: Record<string, unknown>;
}

export interface SubmitResponse {
  engram: { id: string; filePath: string; type: string };
}

export type QuickCaptureMutation = UsePillarMutationResult<
  QuickCapturePayload,
  QuickCaptureResponse
>;
export type SubmitMutation = UsePillarMutationResult<SubmitPayload, SubmitResponse>;
export type SetBulkResults = (
  next: BulkSegmentOutcome[] | ((prev: BulkSegmentOutcome[] | null) => BulkSegmentOutcome[] | null)
) => void;
