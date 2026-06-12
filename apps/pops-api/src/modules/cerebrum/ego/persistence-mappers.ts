/**
 * Adapters mapping `@pops/cerebrum-db`'s `conversationsService` row
 * shapes onto the in-tree ego domain types.
 *
 * The package's types are structurally compatible today; this layer
 * exists as a single seam to absorb future divergence (when PR 3 of
 * the PRD-182 cutover collapses the in-tree types directly onto the
 * package). Keeping the mappers out of `persistence.ts` is also a
 * line-count discipline: the read/write split docstring + the dual
 * handle wiring push the class itself past the file cap, so the
 * shape-coercion lives here.
 *
 * `citations` / `toolCalls` are stored on the wire as opaque JSON
 * (the chat orchestration layer owns the payload). The package
 * surfaces them as `unknown`; the in-tree contract tightens them to
 * `string[] | null` / `unknown[] | null`. The narrowing uses
 * `Array.isArray` + `typeof` guards so a future non-array payload
 * surfaces as `null` instead of leaking a wrong type to the chat
 * pipeline.
 */
import type { Conversation, Message } from './types.js';

/** Subset of the package's `Conversation` shape this adapter needs. */
export interface PackageConversation {
  id: string;
  title: string | null;
  activeScopes: string[];
  appContext: unknown | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/** Subset of the package's `Message` shape this adapter needs. */
export interface PackageMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: unknown | null;
  toolCalls: unknown | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

/** Map the package's `Conversation` onto the in-tree `Conversation`. */
export function mapPackageConversation(row: PackageConversation): Conversation {
  return {
    id: row.id,
    title: row.title,
    activeScopes: row.activeScopes,
    appContext: row.appContext,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Map the package's `Message` onto the in-tree `Message`. */
export function mapPackageMessage(row: PackageMessage): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    citations: toStringArrayOrNull(row.citations),
    toolCalls: toUnknownArrayOrNull(row.toolCalls),
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  };
}

function toStringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

function toUnknownArrayOrNull(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}
