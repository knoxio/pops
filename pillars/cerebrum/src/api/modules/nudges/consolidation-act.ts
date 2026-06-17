/**
 * Consolidation act handler (PRD-084).
 *
 * When a consolidation nudge is acted on, synthesizes a merged engram from the
 * source engrams in the cluster, creates it through the in-pillar
 * {@link EngramService}, then marks the sources `consolidated`.
 */
import type { EngramService } from '../engrams/service.js';
import type { Nudge } from './types.js';

/** Interface for a body synthesizer (LLM-backed or concatenation fallback). */
export interface BodySynthesizer {
  synthesize(bodies: string[], titles: string[]): Promise<string>;
}

/** Fallback synthesizer: concatenates bodies with section headings. */
export class ConcatenationSynthesizer implements BodySynthesizer {
  synthesize(bodies: string[], titles: string[]): Promise<string> {
    const sections = bodies.map((body, i) => `## ${titles[i] ?? `Source ${i + 1}`}\n\n${body}`);
    return Promise.resolve(sections.join('\n\n---\n\n'));
  }
}

export interface ConsolidationActResult {
  mergedEngramId: string;
  consolidatedIds: string[];
}

async function synthesizeBody(
  synthesizer: BodySynthesizer,
  bodies: string[],
  titles: string[]
): Promise<string> {
  try {
    return await synthesizer.synthesize(bodies, titles);
  } catch (err) {
    console.warn(
      `[cerebrum-nudges] synthesizer failed, using concatenation fallback: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return new ConcatenationSynthesizer().synthesize(bodies, titles);
  }
}

/**
 * Execute a consolidation act: read source engrams, synthesize a merged body,
 * create a new engram, then mark each source `consolidated`.
 */
export async function executeConsolidationAct(
  nudge: Nudge,
  engramService: EngramService,
  synthesizer: BodySynthesizer
): Promise<ConsolidationActResult> {
  const sourceIds = nudge.engramIds;
  if (sourceIds.length === 0) {
    throw new Error('Consolidation nudge has no source engram IDs');
  }

  const sources = sourceIds.map((id) => engramService.read(id));
  const bodies = sources.map((s) => s.body);
  const titles = sources.map((s) => s.engram.title);

  const mergedBody = await synthesizeBody(synthesizer, bodies, titles);

  const primary = sources[0]?.engram;
  if (!primary) {
    throw new Error('Consolidation nudge has no source engram IDs');
  }
  const allTags = [...new Set(sources.flatMap((s) => s.engram.tags))];
  const allScopes = [...new Set(sources.flatMap((s) => s.engram.scopes))];

  const merged = engramService.create({
    title: `Consolidated: ${primary.title}`,
    body: mergedBody,
    type: primary.type,
    scopes: allScopes,
    tags: allTags,
    source: 'agent',
  });

  const consolidatedIds: string[] = [];
  for (const id of sourceIds) {
    try {
      engramService.update(id, { status: 'consolidated' });
      consolidatedIds.push(id);
    } catch (err) {
      console.warn(
        `[cerebrum-nudges] failed to consolidate source ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return { mergedEngramId: merged.id, consolidatedIds };
}
