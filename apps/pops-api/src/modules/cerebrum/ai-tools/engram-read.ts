/**
 * cerebrum.engram.read — read an engram by ID.
 *
 * Delegates to EngramService.read() and returns engram metadata + body.
 * Blocks access if all scopes are secret.
 */
import { getEngramService } from '../instance.js';
import { mapServiceError, toolError, toolSuccess } from './result.js';

import type { AiToolResult } from '@pops/types';

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

function allScopesSecret(scopes: string[]): boolean {
  return scopes.length > 0 && scopes.every(isSecretScope);
}

function parseArgs(raw: Record<string, unknown>): { id: string } {
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  return { id };
}

export async function handleEngramRead(raw: Record<string, unknown>): Promise<AiToolResult> {
  const { id } = parseArgs(raw);

  if (!id.trim()) {
    return toolError('id is required', 'VALIDATION_ERROR');
  }

  try {
    const svc = getEngramService();
    const { engram, body } = svc.read(id);

    if (allScopesSecret(engram.scopes)) {
      return toolError(
        `Engram '${id}' is fully secret-scoped and cannot be read via MCP`,
        'SCOPE_BLOCKED'
      );
    }

    return toolSuccess({
      engram: {
        id: engram.id,
        title: engram.title,
        type: engram.type,
        scopes: engram.scopes,
        tags: engram.tags,
        status: engram.status,
        created: engram.created,
        modified: engram.modified,
      },
      body,
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.engram.read tool input. */
export const engramReadSchema = {
  type: 'object' as const,
  properties: {
    id: {
      type: 'string' as const,
      description: 'Engram ID (e.g. "eng_20260427_1430_my-note")',
    },
  },
  required: ['id'] as const,
};
