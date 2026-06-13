import type { BulkSegment } from './bulk-paste';
import type {
  QuickCaptureMutation,
  QuickCapturePayload,
  QuickCaptureResponse,
  SetBulkResults,
  SubmitResponse,
} from './submission-types';
import type { BulkSegmentOutcome, IngestFormValues, SubmitResult } from './types';

export function buildQuickCapturePayload(
  form: IngestFormValues,
  body: string = form.body
): QuickCapturePayload {
  return {
    text: body,
    source: 'manual',
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
  };
}

export function asResult(r: QuickCaptureResponse): SubmitResult {
  return { id: r.id, filePath: r.path, type: r.type };
}

export function toQuickCaptureShape(submitResponse: SubmitResponse): QuickCaptureResponse {
  return {
    id: submitResponse.engram.id,
    path: submitResponse.engram.filePath,
    type: submitResponse.engram.type,
    scopes: [],
  };
}

interface RunBulkArgs {
  form: IngestFormValues;
  segments: BulkSegment[];
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
  setBulkInFlight: (next: boolean) => void;
}

export async function runBulk(args: RunBulkArgs): Promise<void> {
  const { form, segments, mutateAsync, setBulkResults, setBulkInFlight } = args;
  setBulkInFlight(true);
  setBulkResults(segments.map((s) => ({ index: s.index, preview: s.preview, body: s.body })));
  for (const seg of segments) {
    await runSegment({ form, segment: seg, mutateAsync, setBulkResults });
  }
  setBulkInFlight(false);
}

interface RunSegmentArgs {
  form: IngestFormValues;
  segment: BulkSegment;
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
}

async function runSegment(args: RunSegmentArgs): Promise<void> {
  const { form, segment, mutateAsync, setBulkResults } = args;
  try {
    const r = await mutateAsync(buildQuickCapturePayload(form, segment.body));
    setBulkResults((prev) =>
      prev ? prev.map((b) => (b.index === segment.index ? { ...b, result: asResult(r) } : b)) : null
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Capture failed';
    setBulkResults((prev) =>
      prev ? prev.map((b) => (b.index === segment.index ? { ...b, error: message } : b)) : null
    );
  }
}

interface RetrySegmentArgs {
  segmentIndex: number;
  formValues: IngestFormValues;
  bulkResults: BulkSegmentOutcome[] | null;
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
}

export async function retrySegmentImpl(args: RetrySegmentArgs): Promise<void> {
  const { segmentIndex, formValues, bulkResults, mutateAsync, setBulkResults } = args;
  const target = bulkResults?.find((b) => b.index === segmentIndex);
  if (!target) return;
  try {
    const r = await mutateAsync(buildQuickCapturePayload(formValues, target.body));
    setBulkResults((prev) =>
      prev
        ? prev.map((b) =>
            b.index === segmentIndex ? { ...b, result: asResult(r), error: undefined } : b
          )
        : null
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Capture failed';
    setBulkResults((prev) =>
      prev
        ? prev.map((b) =>
            b.index === segmentIndex ? { ...b, error: message, result: undefined } : b
          )
        : null
    );
  }
}
