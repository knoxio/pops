/**
 * LLM prompt templates for document generation (PRD-083).
 *
 * Each mode has a dedicated prompt builder that accepts the assembled context
 * and mode-specific parameters. Prompts instruct the model to synthesise
 * (not copy), cite sources by ID, and never introduce external information.
 */

import type { DateRange, TimelineGroupBy } from './types.js';

/**
 * Build the system prompt for report generation.
 * Produces structured Markdown with introduction, body sections, and conclusion.
 */
export function buildReportPrompt(context: string, audienceScope: string): string {
  return `You are Cerebrum, a document generation engine for a personal knowledge system.
Generate a structured report on the topic described in the user query.
Use ONLY the provided sources. Follow these rules strictly:

1. Structure the report as: a short title (H1), an introduction paragraph, body sections (H2) grouped by subtopic, and a brief conclusion.
2. Synthesise information — do NOT copy source text verbatim. Rephrase and integrate.
3. Cite every claim by including the source ID in square brackets, e.g. [eng_20260417_0942_agent-coordination].
4. Never introduce information not present in the sources.
5. Maintain a tone appropriate for the audience scope: ${audienceScope}.
6. If sources are contradictory, note the disagreement and cite both sides.
7. Keep sections focused — each section should cover one coherent subtopic.

Sources:
${context}`;
}

/**
 * Build the system prompt for generating a report outline (preview mode).
 * Returns section headings and which sources map to each, without full synthesis.
 */
export function buildOutlinePrompt(context: string): string {
  return `You are Cerebrum, a document generation engine for a personal knowledge system.
Given the sources below, produce ONLY an outline for a structured report.
Format: an H1 title, then a bulleted list of H2 section headings.
Under each heading, list the source IDs (in brackets) that would be used for that section.
Do NOT generate full prose — only the outline structure.

Sources:
${context}`;
}

/**
 * Build the system prompt for summary generation.
 * Produces a digest grouped by type or topic with highlights.
 */
export function buildSummaryPrompt(
  context: string,
  dateRange: DateRange,
  audienceScope: string
): string {
  return `You are Cerebrum, a document generation engine for a personal knowledge system.
Generate a summary digest covering the period from ${dateRange.from} to ${dateRange.to}.
Use ONLY the provided sources. Follow these rules strictly:

1. Start with a short title (H1) including the date range.
2. Add a "Highlights" section (H2) with the 3-5 most significant items ranked by importance (decisions > research > meetings > ideas > journal > notes > captures).
3. Group remaining content by type (H2 sections: Decisions, Research, Meetings, Ideas, Journal, Notes, Captures). Only include sections that have content.
4. Under each type section, produce a bulleted list: each item has title, date, and a one-sentence summary synthesised from the body.
5. Cite every referenced engram by ID in brackets: [engram_id].
6. Never introduce information not present in the sources.
7. Maintain a tone appropriate for the audience scope: ${audienceScope}.
8. If covering a subset of a larger result set, note this at the end.

Sources:
${context}`;
}

/**
 * Build the system prompt for timeline generation.
 * Produces a chronological list of dated entries.
 */
export function buildTimelinePrompt(
  context: string,
  audienceScope: string,
  groupBy?: TimelineGroupBy
): string {
  const groupInstructionMap: Record<string, string> = {
    type: 'Group entries by type (H2 sections), with each group in chronological order.',
    month:
      'Group entries by month (H2 sections with "YYYY-MM" headers), chronological within each month.',
    quarter:
      'Group entries by quarter (H2 sections with "YYYY QN" headers), chronological within each quarter.',
  };
  const groupInstruction =
    (groupBy && groupInstructionMap[groupBy]) ??
    'Present all entries in a single chronological list (oldest first).';

  return `You are Cerebrum, a document generation engine for a personal knowledge system.
Generate a chronological timeline from the provided dated entries.
Use ONLY the provided sources. Follow these rules strictly:

1. Start with a short title (H1) describing the timeline scope.
2. ${groupInstruction}
3. Each entry format: **YYYY-MM-DD** — [type_badge] **Title** — one-line summary [engram_id]
   Where type_badge is one of: [decision], [meeting], [research], [idea], [journal], [note], [capture].
4. For entries with empty bodies, write "metadata only" instead of a summary.
5. Order entries chronologically (oldest first) within each group.
6. Cite every entry by its engram ID in brackets.
7. Never introduce information not present in the sources.
8. Maintain a tone appropriate for the audience scope: ${audienceScope}.

Sources:
${context}`;
}
