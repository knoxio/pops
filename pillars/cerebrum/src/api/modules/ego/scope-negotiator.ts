/**
 * ConversationScopeNegotiator -- infers scope adjustments during conversation.
 *
 * PRD-087 US-04: Scope Negotiation.
 */

import {
  PERSONAL_KEYWORDS,
  PERSONAL_PHRASES,
  SECRET_MENTION_KEYWORDS,
  SECRET_UNLOCK_PHRASES,
  WORK_KEYWORDS,
  WORK_PHRASES,
  filterByPrefix,
  isSecretScope,
  matchKnownScope,
  matchesKeywords,
  matchesPhrases,
  scopesEqual,
} from './scope-keywords.js';

import type { Message } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Channels through which Ego conversations can originate. */
export type EgoChannel = 'shell' | 'moltbot' | 'mcp' | 'cli';

export interface ScopeNegotiationResult {
  scopes: string[];
  changed: boolean;
  reason: string | null;
}

export interface ScopeDefault {
  /** Scope prefix filters. Empty array means all non-secret scopes. */
  prefixes: string[];
}

export interface ChannelScopeDefaults {
  shell: ScopeDefault;
  moltbot: ScopeDefault;
  mcp: ScopeDefault;
  cli: ScopeDefault;
}

export interface NegotiateParams {
  message: string;
  currentScopes: string[];
  conversationHistory: Message[];
  channel: EgoChannel;
  /** All scopes known to the system (for matching by name). */
  knownScopes?: string[];
}

// ---------------------------------------------------------------------------
// Channel defaults
// ---------------------------------------------------------------------------

const DEFAULT_CHANNEL_SCOPES: ChannelScopeDefaults = {
  shell: { prefixes: [] },
  moltbot: { prefixes: ['personal.'] },
  mcp: { prefixes: ['work.'] },
  cli: { prefixes: [] },
};

// ---------------------------------------------------------------------------
// Negotiator
// ---------------------------------------------------------------------------

export class ConversationScopeNegotiator {
  private readonly channelDefaults: ChannelScopeDefaults;

  constructor(channelDefaults?: Partial<ChannelScopeDefaults>) {
    this.channelDefaults = { ...DEFAULT_CHANNEL_SCOPES, ...channelDefaults };
  }

  /** Infer scope adjustments from the user's message and channel context. */
  negotiate(params: NegotiateParams): ScopeNegotiationResult {
    const { message, currentScopes, channel, knownScopes = [] } = params;
    const pool = knownScopes.length > 0 ? knownScopes : currentScopes;

    return (
      this.trySecretUnlock(message, pool, currentScopes) ??
      this.tryExplicitOverride(message, pool) ??
      this.tryPhraseDetection(message, pool, currentScopes) ??
      this.tryKnownScopeMatch(message, pool, currentScopes) ??
      this.tryKeywordDetection(message, pool, currentScopes) ??
      this.tryChannelDefaults(currentScopes, channel, pool) ?? {
        scopes: currentScopes,
        changed: false,
        reason: null,
      }
    );
  }

  /** Detect whether the user's message mentions potentially secret content. */
  detectSecretMention(message: string): string | null {
    if (matchesPhrases(message, SECRET_UNLOCK_PHRASES)) return null;
    if (matchesKeywords(message, SECRET_MENTION_KEYWORDS)) {
      return 'Your question may reference sensitive data. Secret scopes are excluded unless you explicitly ask to include them (e.g. "include my secret notes").';
    }
    return null;
  }

  /** Get default scopes for a channel, filtered from the known scope pool. */
  getChannelDefaults(channel: EgoChannel, knownScopes: string[]): string[] {
    const config = this.channelDefaults[channel];
    if (config.prefixes.length === 0) {
      return knownScopes.filter((s) => !isSecretScope(s));
    }
    return knownScopes.filter(
      (s) => config.prefixes.some((p) => s.startsWith(p)) && !isSecretScope(s)
    );
  }

  // -----------------------------------------------------------------------
  // Private negotiation steps (each returns null to fall through)
  // -----------------------------------------------------------------------

  private trySecretUnlock(
    message: string,
    pool: string[],
    currentScopes: string[]
  ): ScopeNegotiationResult | null {
    if (!matchesPhrases(message, SECRET_UNLOCK_PHRASES)) return null;
    return {
      scopes: pool,
      changed: !scopesEqual(pool, currentScopes),
      reason: 'Secret scopes unlocked by explicit request',
    };
  }

  private tryExplicitOverride(message: string, pool: string[]): ScopeNegotiationResult | null {
    const lower = message.toLowerCase();
    if (!lower.includes('only')) return null;

    if (lower.includes('personal') || matchesPhrases(message, PERSONAL_PHRASES)) {
      const scopes = filterByPrefix(pool, 'personal.');
      if (scopes.length > 0) {
        return {
          scopes,
          changed: true,
          reason: 'Explicit override: restricted to personal scopes',
        };
      }
    }
    if (lower.includes('work') || matchesPhrases(message, WORK_PHRASES)) {
      const scopes = filterByPrefix(pool, 'work.');
      if (scopes.length > 0) {
        return { scopes, changed: true, reason: 'Explicit override: restricted to work scopes' };
      }
    }
    return null;
  }

  private tryPhraseDetection(
    message: string,
    pool: string[],
    currentScopes: string[]
  ): ScopeNegotiationResult | null {
    if (matchesPhrases(message, WORK_PHRASES)) {
      const scopes = filterByPrefix(pool, 'work.');
      if (scopes.length > 0) {
        return this.buildResult(scopes, currentScopes, 'work');
      }
    }
    if (matchesPhrases(message, PERSONAL_PHRASES)) {
      const scopes = filterByPrefix(pool, 'personal.');
      if (scopes.length > 0) {
        return this.buildResult(scopes, currentScopes, 'personal');
      }
    }
    return null;
  }

  private tryKnownScopeMatch(
    message: string,
    pool: string[],
    currentScopes: string[]
  ): ScopeNegotiationResult | null {
    const match = matchKnownScope(message, pool);
    if (!match) return null;

    const prefix = match + '.';
    const narrowed = pool.filter((s) => (s === match || s.startsWith(prefix)) && !isSecretScope(s));
    const scopes = narrowed.length > 0 ? narrowed : [match];
    return {
      scopes,
      changed: !scopesEqual(scopes, currentScopes),
      reason: `Narrowed to ${match} based on topic mention`,
    };
  }

  private tryKeywordDetection(
    message: string,
    pool: string[],
    currentScopes: string[]
  ): ScopeNegotiationResult | null {
    if (matchesKeywords(message, WORK_KEYWORDS)) {
      const scopes = filterByPrefix(pool, 'work.');
      if (scopes.length > 0) {
        return this.buildResult(scopes, currentScopes, 'work');
      }
    }
    if (matchesKeywords(message, PERSONAL_KEYWORDS)) {
      const scopes = filterByPrefix(pool, 'personal.');
      if (scopes.length > 0) {
        return this.buildResult(scopes, currentScopes, 'personal');
      }
    }
    return null;
  }

  private tryChannelDefaults(
    currentScopes: string[],
    channel: EgoChannel,
    pool: string[]
  ): ScopeNegotiationResult | null {
    if (currentScopes.length > 0) return null;
    const defaults = this.getChannelDefaults(channel, pool);
    return {
      scopes: defaults,
      changed: defaults.length > 0,
      reason: defaults.length > 0 ? `Applied ${channel} channel default scopes` : null,
    };
  }

  private buildResult(
    scopes: string[],
    currentScopes: string[],
    domain: 'work' | 'personal'
  ): ScopeNegotiationResult {
    return {
      scopes,
      changed: !scopesEqual(scopes, currentScopes),
      reason: `Narrowed to ${domain} scopes based on conversation content`,
    };
  }
}
