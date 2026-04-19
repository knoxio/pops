export interface HistoryRecord {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHits: number;
  errors: number;
}

export type HistoryPayload = {
  records: HistoryRecord[];
  summary: { totalCostUsd: number };
};
