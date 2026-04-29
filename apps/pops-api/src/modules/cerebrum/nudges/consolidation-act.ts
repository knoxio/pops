/**
 * Consolidation act handler (PRD-084 #2241).
 *
 * When a consolidation nudge is acted on, synthesizes a merged engram from the
 * source engrams in the cluster, then archives the sources.
 */
import { logger } from '../../../lib/logger.js';

import type { EngramService } from '../engrams/service.js';
import type { Nudge } from './types.js';

/** Interface for an LLM-based body synthesizer. */
export interface BodySynthesizer {
  synthesize(bodies: string[], titles: string[]): Promise<string>;
}

/** Fallback synthesizer: concatenates bodies with section headings. */
export class ConcatenationSynthesizer implements BodySynthesizer {
  async synthesize(bodies: string[], titles: string[]): Promise<string> {
    const sections = bodies.map((body, i) => {
      const title = titles[i] ?? `Source ${i + 1}`;
      return `## ${title}\n\n${body}`;
    });
    return sections.join('\n\n---\n\n');
  }
}

export interface ConsolidationActResult {
  mergedEngramId: string;
  archivedIds: string[];
}

/**
 * Execute a consolidation act: read source engrams, synthesize merged body,
 * create a new engram, and archive sources.
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

  // Read all source engrams
  const sources = sourceIds.map((id) => {
    const { engram, body } = engramService.read(id);
    return { engram, body };
  });

  const bodies = sources.map((s) => s.body);
  const titles = sources.map((s) => s.engram.title);

  // Synthesize merged body
  let mergedBody: string;
  try {
    mergedBody = await synthesizer.synthesize(bodies, titles);
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      '[ConsolidationAct] Synthesizer failed, using concatenation fallback'
    );
    const fallback = new ConcatenationSynthesizer();
    mergedBody = await fallback.synthesize(bodies, titles);
  }

  // Derive merged metadata from first source (primary) and all sources
  const primary = sources[0]?.engram;
  if (!primary) {
    throw new Error('Consolidation nudge has no source engram IDs');
  }
  const allTags = [...new Set(sources.flatMap((s) => s.engram.tags))];
  const allScopes = [...new Set(sources.flatMap((s) => s.engram.scopes))];

  // Create merged engram (source 'agent' — system-initiated consolidation)
  const merged = engramService.create({
    title: `Consolidated: ${primary.title}`,
    body: mergedBody,
    type: primary.type,
    scopes: allScopes,
    tags: allTags,
    source: 'agent',
  });

  // Archive source engrams
  const archivedIds: string[] = [];
  for (const id of sourceIds) {
    try {
      engramService.update(id, { status: 'consolidated' });
      archivedIds.push(id);
    } catch (err) {
      logger.warn(
        { engramId: id, error: err instanceof Error ? err.message : String(err) },
        '[ConsolidationAct] Failed to archive source engram'
      );
    }
  }

  logger.info(
    { mergedId: merged.id, archivedCount: archivedIds.length, sourceCount: sourceIds.length },
    '[ConsolidationAct] Consolidation complete'
  );

  return { mergedEngramId: merged.id, archivedIds };
}
