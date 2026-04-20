import pino from 'pino';

import { DEAD_LETTER_QUEUE, getDeadLetterQueue } from './queues.js';

const logger = pino({ name: 'pops-worker:dead-letter' });

export interface DeadLetterParams {
  queue: string;
  jobId: string | undefined;
  jobName: string;
  data: unknown;
  attemptsMade: number;
  err: Error;
  removeOriginal?: () => Promise<void>;
}

export function moveToDeadLetter(params: DeadLetterParams): void {
  const { queue, jobId, jobName, data, attemptsMade, err, removeOriginal } = params;
  void getDeadLetterQueue()
    .add(DEAD_LETTER_QUEUE, {
      originalQueue: queue,
      originalJobId: jobId,
      originalJobName: jobName,
      originalData: data,
      failedAt: new Date().toISOString(),
      attemptsMade,
      finalError: err.message,
      finalErrorStack: err.stack,
    })
    .then(() => removeOriginal?.())
    .catch((addErr: unknown) => {
      logger.error({ addErr }, 'Failed to move job to dead-letter queue');
    });
}
