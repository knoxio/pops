/**
 * Contradiction-evidence extraction for `cerebrum.nudges.contradictions`.
 *
 * Contradiction evidence is stored on `Nudge.action.params.contradiction`
 * when the underlying pattern is a contradiction. Other pattern nudges
 * (recurring / emerging) carry no contradiction field, so this returns null
 * for them — the caller drops those rows from the projection.
 */
export interface ContradictionEvidence {
  engramA: string;
  engramB: string;
  excerptA: string;
  excerptB: string;
  conflict: string;
}

const EVIDENCE_FIELDS = ['engramA', 'engramB', 'excerptA', 'excerptB', 'conflict'] as const;

export function extractContradiction(
  params: Record<string, unknown> | undefined
): ContradictionEvidence | null {
  if (!params) return null;
  const raw = params['contradiction'];
  if (!raw || typeof raw !== 'object') return null;
  const evidence = raw as Record<string, unknown>;
  const result: Partial<ContradictionEvidence> = {};
  for (const field of EVIDENCE_FIELDS) {
    const value = evidence[field];
    if (typeof value !== 'string' || value.length === 0) return null;
    result[field] = value;
  }
  return result as ContradictionEvidence;
}
