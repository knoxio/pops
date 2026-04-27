/**
 * PersistenceStoreAdapter — wraps ConversationPersistence to implement the
 * ConversationStore interface that the ConversationEngine depends on.
 */
import type { ConversationPersistence } from './persistence.js';
import type { AppContext, Conversation, ConversationStore, Message } from './types.js';

export class PersistenceStoreAdapter implements ConversationStore {
  private readonly persistence: ConversationPersistence;

  constructor(persistence: ConversationPersistence) {
    this.persistence = persistence;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const result = this.persistence.getConversation(id);
    return result?.conversation ?? null;
  }

  async createConversation(params: {
    id: string;
    title: string | null;
    activeScopes: string[];
    appContext: AppContext | null;
    model: string;
  }): Promise<Conversation> {
    return this.persistence.createConversation({
      title: params.title ?? undefined,
      scopes: params.activeScopes,
      appContext: params.appContext,
      model: params.model,
    });
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const result = this.persistence.getConversation(conversationId);
    return result?.messages ?? [];
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    this.persistence.appendMessage(conversationId, {
      role: message.role,
      content: message.content,
      citations: message.citations ?? undefined,
      toolCalls: message.toolCalls ?? undefined,
      tokensIn: message.tokensIn ?? undefined,
      tokensOut: message.tokensOut ?? undefined,
    });
  }

  async touchConversation(_conversationId: string): Promise<void> {
    // appendMessage already updates updatedAt via persistence.appendMessage
  }

  async addContextEngrams(
    conversationId: string,
    engrams: Array<{ engramId: string; relevanceScore: number }>
  ): Promise<void> {
    for (const { engramId, relevanceScore } of engrams) {
      this.persistence.upsertContext(conversationId, engramId, relevanceScore);
    }
  }
}
