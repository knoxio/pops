/**
 * The requests behind `useDraftWriteThrough` (finance ADR-005): create,
 * write, heartbeat and release, with the two-second debounce and the
 * lease-lost latch. Kept apart from the subscription so each can be read
 * on its own.
 */
import { FinanceApiError, unwrap } from '../../../finance-api-helpers.js';
import {
  importDraftsCreate,
  importDraftsHeartbeat,
  importDraftsRelease,
  importDraftsWrite,
} from '../../../finance-api/index.js';
import { ownerToken } from '../../../store/import-draft-owner';
import {
  draftCountsOf,
  draftPayloadChanged,
  toDraftPayload,
} from '../../../store/import-draft-payload';
import { useImportStore } from '../../../store/importStore';

import type { ImportStore } from '../../../store/importStore';

export const DRAFT_WRITE_DEBOUNCE_MS = 2000;

/** How often a mounted wizard proves it is still in the draft; the server calls a day of silence stale. */
export const DRAFT_HEARTBEAT_MS = 30_000;

function writeBody(state: ImportStore, release: boolean) {
  const payload = toDraftPayload(state);
  return { ...draftCountsOf(payload), payload, ownerToken: ownerToken(), release };
}

function isOwnedElsewhere(error: unknown): boolean {
  return error instanceof FinanceApiError && error.code === 'DraftOwnedElsewhere';
}

function releaseDraft(keepalive: boolean): Promise<void> {
  const { draftId } = useImportStore.getState();
  if (draftId === null) return Promise.resolve();
  return importDraftsRelease({
    path: { id: draftId },
    body: { ownerToken: ownerToken() },
    keepalive,
  }).then(
    () => undefined,
    () => undefined
  );
}

/** Create the draft for a fresh run and put its id in the store. */
async function createDraft(state: ImportStore, accountId: string): Promise<void> {
  const payload = toDraftPayload(state);
  const result = await importDraftsCreate({
    body: {
      accountId,
      dialectId: state.dialectId,
      fileNames: state.sourceFileNames.length > 0 ? state.sourceFileNames : ['untitled'],
      payload,
      ...draftCountsOf(payload),
      ownerToken: ownerToken(),
    },
  });
  useImportStore.getState().setDraftId(unwrap(result).data.id);
}

export interface WriteThroughCallbacks {
  onOwnedElsewhere: () => void;
  onSaveFailed: () => void;
  onDraftCreated: () => void;
}

interface WriteOptions {
  release: boolean;
  keepalive?: boolean;
}

/** The requests behind {@link startDraftWriteThrough}, with the debounce and the lease-lost latch. */
export class DraftWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private lost = false;
  private creating = false;
  private dirty = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly callbacks: WriteThroughCallbacks) {}

  stopped(): boolean {
    return this.lost;
  }

  pending(): boolean {
    return this.dirty || this.timer !== null;
  }

  settled(): Promise<void> {
    return this.inFlight;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly failed = (error: unknown): void => {
    if (isOwnedElsewhere(error)) {
      this.lost = true;
      this.clearTimer();
      this.stopHeartbeat();
      this.callbacks.onOwnedElsewhere();
      return;
    }
    this.callbacks.onSaveFailed();
  };

  startHeartbeat(): void {
    if (this.beat !== null || this.lost) return;
    this.beat = setInterval(() => {
      const { draftId } = useImportStore.getState();
      if (draftId === null) return;
      void importDraftsHeartbeat({ path: { id: draftId }, body: { ownerToken: ownerToken() } })
        .then((result) => {
          unwrap(result);
        })
        .catch((error: unknown) => {
          if (isOwnedElsewhere(error)) this.failed(error);
        });
    }, DRAFT_HEARTBEAT_MS);
  }

  stopHeartbeat(): void {
    if (this.beat !== null) clearInterval(this.beat);
    this.beat = null;
  }

  write({ release, keepalive = false }: WriteOptions): Promise<void> {
    this.clearTimer();
    const state = useImportStore.getState();
    if (this.lost || state.draftId === null) return Promise.resolve();
    this.dirty = false;
    this.inFlight = importDraftsWrite({
      path: { id: state.draftId },
      body: writeBody(state, release),
      keepalive,
    })
      .then((result) => {
        unwrap(result);
      })
      .catch(this.failed);
    return this.inFlight;
  }

  schedule(immediate: boolean): void {
    this.dirty = true;
    if (immediate) {
      void this.write({ release: false });
      return;
    }
    this.timer ??= setTimeout(() => void this.write({ release: false }), DRAFT_WRITE_DEBOUNCE_MS);
  }

  create(state: ImportStore): void {
    if (this.creating || this.lost || state.accountId === null) return;
    this.creating = true;
    this.inFlight = createDraft(state, state.accountId)
      .then(() => {
        this.callbacks.onDraftCreated();
        this.startHeartbeat();
        if (draftPayloadChanged(useImportStore.getState(), state)) {
          void this.write({ release: false });
        }
      })
      .catch(this.failed)
      .finally(() => {
        this.creating = false;
      });
  }

  release(keepalive: boolean): Promise<void> {
    return this.lost ? Promise.resolve() : releaseDraft(keepalive);
  }
}
