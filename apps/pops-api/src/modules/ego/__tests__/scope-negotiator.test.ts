import { describe, expect, it } from 'vitest';

import { ConversationScopeNegotiator } from '../scope-negotiator.js';

import type { EgoChannel, NegotiateParams } from '../scope-negotiator.js';
import type { Message } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_SCOPES = [
  'work.projects',
  'work.projects.karbon',
  'work.projects.pops',
  'work.clients',
  'work.clients.acme',
  'work.notes',
  'work.secret.keys',
  'personal.journal',
  'personal.health',
  'personal.cooking',
  'personal.finance',
  'personal.secret.diary',
];

function makeMessage(role: string, content: string): Message {
  return {
    id: `msg_test_${Math.random().toString(36).slice(2, 8)}`,
    conversationId: 'conv_test_001',
    role,
    content,
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: new Date().toISOString(),
  };
}

function negotiate(
  negotiator: ConversationScopeNegotiator,
  overrides: Partial<NegotiateParams> = {}
): ReturnType<ConversationScopeNegotiator['negotiate']> {
  return negotiator.negotiate({
    message: overrides.message ?? 'hello',
    currentScopes: overrides.currentScopes ?? [],
    conversationHistory: overrides.conversationHistory ?? [],
    channel: overrides.channel ?? 'shell',
    knownScopes: overrides.knownScopes ?? KNOWN_SCOPES,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversationScopeNegotiator', () => {
  const negotiator = new ConversationScopeNegotiator();

  // -----------------------------------------------------------------------
  // Work keyword detection
  // -----------------------------------------------------------------------
  describe('work keyword detection', () => {
    it('detects "at work" phrase and narrows to work scopes', () => {
      const result = negotiate(negotiator, { message: "I'm at work right now" });
      expect(result.changed).toBe(true);
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
      expect(result.scopes).not.toContain('work.secret.keys');
      expect(result.reason).toContain('work');
    });

    it('detects "for work" phrase', () => {
      const result = negotiate(negotiator, { message: 'This is for work' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('detects "work stuff" phrase', () => {
      const result = negotiate(negotiator, { message: 'Show me work stuff' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('detects standalone work keywords like "meeting"', () => {
      const result = negotiate(negotiator, { message: 'What was discussed in the meeting?' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('detects "project" keyword', () => {
      const result = negotiate(negotiator, { message: 'Tell me about the project status' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('detects "sprint" keyword', () => {
      const result = negotiate(negotiator, { message: 'How did the last sprint go?' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('excludes secret scopes even when work is detected', () => {
      const result = negotiate(negotiator, { message: 'Show me work notes' });
      expect(result.scopes).not.toContain('work.secret.keys');
    });
  });

  // -----------------------------------------------------------------------
  // Personal keyword detection
  // -----------------------------------------------------------------------
  describe('personal keyword detection', () => {
    it('detects "my personal" phrase', () => {
      const result = negotiate(negotiator, { message: 'Show my personal notes' });
      expect(result.changed).toBe(true);
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
      expect(result.scopes).not.toContain('personal.secret.diary');
      expect(result.reason).toContain('personal');
    });

    it('detects "at home" phrase', () => {
      const result = negotiate(negotiator, { message: 'Things I need to do at home' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('detects "personal stuff" phrase', () => {
      const result = negotiate(negotiator, { message: 'Show me personal stuff' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('detects "journal" keyword', () => {
      const result = negotiate(negotiator, { message: 'What did I write in my journal?' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('detects "therapy" keyword', () => {
      const result = negotiate(negotiator, { message: 'Notes from therapy' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('detects "family" keyword', () => {
      const result = negotiate(negotiator, { message: 'Family plans for the weekend' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('excludes personal secret scopes', () => {
      const result = negotiate(negotiator, { message: 'Show personal health notes' });
      expect(result.scopes).not.toContain('personal.secret.diary');
    });
  });

  // -----------------------------------------------------------------------
  // Known scope matching
  // -----------------------------------------------------------------------
  describe('known scope matching', () => {
    it('matches "karbon project" to work.projects.karbon', () => {
      const result = negotiate(negotiator, {
        message: 'Tell me about the karbon project',
      });
      expect(result.scopes).toContain('work.projects.karbon');
      expect(result.reason).toContain('work.projects.karbon');
    });

    it('matches "pops" to work.projects.pops', () => {
      const result = negotiate(negotiator, {
        message: 'What is the status of pops?',
      });
      expect(result.scopes).toContain('work.projects.pops');
    });

    it('matches "acme" to work.clients.acme', () => {
      const result = negotiate(negotiator, {
        message: 'Show me notes about acme',
      });
      expect(result.scopes).toContain('work.clients.acme');
    });

    it('prefers the most specific (longest) scope match', () => {
      // "karbon" matches work.projects.karbon which is longer than just a 2-segment scope
      const result = negotiate(negotiator, {
        message: 'Details about karbon',
      });
      expect(result.scopes).toContain('work.projects.karbon');
    });

    it('does not match secret scopes by name', () => {
      // "keys" is a segment in work.secret.keys but secret scopes should never be matched
      const result = negotiate(negotiator, {
        message: 'Show me the keys to success',
        currentScopes: KNOWN_SCOPES.filter((s) => !s.includes('secret')),
      });
      expect(result.scopes).not.toContain('work.secret.keys');
    });

    it('does not match on very short scope segments', () => {
      // Segments shorter than 3 chars are ignored to avoid false positives
      const scopes = [...KNOWN_SCOPES, 'work.ab'];
      const result = negotiate(negotiator, {
        message: 'Tell me ab something',
        knownScopes: scopes,
      });
      // Should not match work.ab because 'ab' is too short
      expect(result.scopes).not.toEqual(['work.ab']);
    });
  });

  // -----------------------------------------------------------------------
  // Channel defaults
  // -----------------------------------------------------------------------
  describe('channel defaults', () => {
    it('shell defaults to all non-secret scopes when current scopes are empty', () => {
      const result = negotiate(negotiator, {
        message: 'hello',
        currentScopes: [],
        channel: 'shell',
      });
      expect(result.scopes.length).toBeGreaterThan(0);
      expect(result.scopes.every((s) => !s.includes('secret'))).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.reason).toContain('shell');
    });

    it('moltbot defaults to personal scopes', () => {
      const result = negotiate(negotiator, {
        message: 'hello',
        currentScopes: [],
        channel: 'moltbot',
      });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
      expect(result.scopes.every((s) => !s.includes('secret'))).toBe(true);
    });

    it('mcp defaults to work scopes', () => {
      const result = negotiate(negotiator, {
        message: 'hello',
        currentScopes: [],
        channel: 'mcp',
      });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
      expect(result.scopes.every((s) => !s.includes('secret'))).toBe(true);
    });

    it('cli defaults to all non-secret scopes', () => {
      const result = negotiate(negotiator, {
        message: 'hello',
        currentScopes: [],
        channel: 'cli',
      });
      expect(result.scopes.length).toBeGreaterThan(0);
      expect(result.scopes.every((s) => !s.includes('secret'))).toBe(true);
    });

    it('does not apply channel defaults when current scopes are already set', () => {
      const result = negotiate(negotiator, {
        message: 'hello',
        currentScopes: ['work.projects'],
        channel: 'moltbot',
      });
      // Should keep existing scopes, not override with moltbot defaults
      expect(result.scopes).toEqual(['work.projects']);
      expect(result.changed).toBe(false);
    });

    it('supports custom channel defaults via constructor', () => {
      const custom = new ConversationScopeNegotiator({
        moltbot: { prefixes: ['work.'] },
      });
      const result = custom.negotiate({
        message: 'hello',
        currentScopes: [],
        conversationHistory: [],
        channel: 'moltbot',
        knownScopes: KNOWN_SCOPES,
      });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Secret hard-block
  // -----------------------------------------------------------------------
  describe('secret hard-block', () => {
    it('never includes secret scopes during work inference', () => {
      const result = negotiate(negotiator, { message: 'Show me work notes' });
      expect(result.scopes).not.toContain('work.secret.keys');
    });

    it('never includes secret scopes during personal inference', () => {
      const result = negotiate(negotiator, { message: 'My personal journal' });
      expect(result.scopes).not.toContain('personal.secret.diary');
    });

    it('never includes secret scopes in channel defaults', () => {
      for (const channel of ['shell', 'moltbot', 'mcp', 'cli'] as EgoChannel[]) {
        const result = negotiate(negotiator, {
          message: 'hello',
          currentScopes: [],
          channel,
        });
        expect(result.scopes.every((s) => !s.includes('secret'))).toBe(true);
      }
    });

    it('unlocks secret scopes when user explicitly says "include secrets"', () => {
      const result = negotiate(negotiator, {
        message: 'include secrets',
        currentScopes: ['work.projects'],
      });
      expect(result.scopes).toContain('work.secret.keys');
      expect(result.changed).toBe(true);
      expect(result.reason).toContain('Secret scopes unlocked');
    });

    it('unlocks secret scopes with "include my secret notes"', () => {
      const result = negotiate(negotiator, {
        message: 'Please include my secret notes',
        currentScopes: ['personal.journal'],
      });
      expect(result.scopes).toContain('personal.secret.diary');
    });

    it('unlocks secret scopes with "show my secrets"', () => {
      const result = negotiate(negotiator, {
        message: 'show my secrets',
        currentScopes: ['personal.journal'],
      });
      expect(result.changed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Secret mention detection (notice)
  // -----------------------------------------------------------------------
  describe('secret mention detection', () => {
    it('returns a notice when "secret" is mentioned without unlock', () => {
      const notice = negotiator.detectSecretMention('Can I see my secret notes?');
      expect(notice).not.toBeNull();
      expect(notice).toContain('Secret scopes are excluded');
    });

    it('returns a notice when "password" is mentioned', () => {
      const notice = negotiator.detectSecretMention('Where is my password?');
      expect(notice).not.toBeNull();
    });

    it('returns a notice when "credential" is mentioned', () => {
      const notice = negotiator.detectSecretMention('Show the credential for the server');
      expect(notice).not.toBeNull();
    });

    it('returns null when no secret keywords are present', () => {
      const notice = negotiator.detectSecretMention('Tell me about my work projects');
      expect(notice).toBeNull();
    });

    it('returns null when user explicitly unlocks secrets (no warning needed)', () => {
      const notice = negotiator.detectSecretMention('include my secret notes');
      expect(notice).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Explicit override wins over inference
  // -----------------------------------------------------------------------
  describe('explicit override', () => {
    it('"only look at personal stuff" overrides current work scopes', () => {
      const result = negotiate(negotiator, {
        message: 'only look at personal stuff',
        currentScopes: ['work.projects', 'work.notes'],
      });
      expect(result.changed).toBe(true);
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
      expect(result.reason).toContain('Explicit override');
    });

    it('"only work" overrides current personal scopes', () => {
      const result = negotiate(negotiator, {
        message: 'only work related content please',
        currentScopes: ['personal.journal', 'personal.health'],
      });
      expect(result.changed).toBe(true);
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
      expect(result.reason).toContain('Explicit override');
    });

    it('"only personal" restricts to personal scopes', () => {
      const result = negotiate(negotiator, {
        message: 'only personal',
        currentScopes: KNOWN_SCOPES.filter((s) => !s.includes('secret')),
      });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scope change detection and reason generation
  // -----------------------------------------------------------------------
  describe('scope change detection and reasons', () => {
    it('reports changed=true when scopes actually change', () => {
      const result = negotiate(negotiator, {
        message: 'at work',
        currentScopes: ['personal.journal'],
      });
      expect(result.changed).toBe(true);
      expect(result.reason).not.toBeNull();
    });

    it('reports changed=false when inferred scopes match current', () => {
      const workScopes = KNOWN_SCOPES.filter((s) => s.startsWith('work.') && !s.includes('secret'));
      const result = negotiate(negotiator, {
        message: 'at work',
        currentScopes: workScopes,
      });
      expect(result.changed).toBe(false);
    });

    it('reports changed=false for neutral messages with existing scopes', () => {
      const result = negotiate(negotiator, {
        message: 'tell me something interesting',
        currentScopes: ['work.projects'],
      });
      expect(result.changed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('generates descriptive reason for work narrowing', () => {
      const result = negotiate(negotiator, {
        message: 'at work',
        currentScopes: ['personal.journal'],
      });
      expect(result.reason).toContain('work');
    });

    it('generates descriptive reason for personal narrowing', () => {
      const result = negotiate(negotiator, {
        message: 'my personal journal',
        currentScopes: ['work.projects'],
      });
      expect(result.reason).toContain('personal');
    });

    it('generates descriptive reason for known scope match', () => {
      const result = negotiate(negotiator, {
        message: 'about the karbon project',
        currentScopes: ['work.projects'],
      });
      expect(result.reason).toContain('karbon');
    });
  });

  // -----------------------------------------------------------------------
  // Multi-turn scope drift
  // -----------------------------------------------------------------------
  describe('multi-turn scope drift', () => {
    it('shifts from work to personal when topic changes', () => {
      // Turn 1: work context
      const turn1 = negotiate(negotiator, {
        message: 'Tell me about the karbon project',
        currentScopes: [],
        conversationHistory: [],
      });
      expect(turn1.scopes).toContain('work.projects.karbon');

      // Turn 2: personal context shift
      const turn2 = negotiate(negotiator, {
        message: 'Now tell me about my personal journal',
        currentScopes: turn1.scopes,
        conversationHistory: [
          makeMessage('user', 'Tell me about the karbon project'),
          makeMessage('assistant', 'The karbon project is about...'),
        ],
      });
      expect(turn2.changed).toBe(true);
      expect(turn2.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('shifts from personal to work when topic changes', () => {
      const personalScopes = KNOWN_SCOPES.filter(
        (s) => s.startsWith('personal.') && !s.includes('secret')
      );

      const result = negotiate(negotiator, {
        message: "Now let's look at work projects",
        currentScopes: personalScopes,
        conversationHistory: [
          makeMessage('user', 'Show me my journal'),
          makeMessage('assistant', 'Here are your journal entries...'),
        ],
      });
      expect(result.changed).toBe(true);
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('maintains scopes when topic stays consistent', () => {
      const workScopes = KNOWN_SCOPES.filter((s) => s.startsWith('work.') && !s.includes('secret'));

      const result = negotiate(negotiator, {
        message: 'What else about that client?',
        currentScopes: workScopes,
        conversationHistory: [
          makeMessage('user', 'Tell me about acme'),
          makeMessage('assistant', 'Acme is a client...'),
        ],
      });
      // "client" is a work keyword, so it should stay in work scopes
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles empty known scopes gracefully', () => {
      const result = negotiate(negotiator, {
        message: 'at work',
        knownScopes: [],
        currentScopes: [],
      });
      // No scopes to filter, so returns empty
      expect(result.scopes).toEqual([]);
    });

    it('handles empty message', () => {
      const result = negotiate(negotiator, {
        message: '',
        currentScopes: ['work.projects'],
      });
      expect(result.changed).toBe(false);
      expect(result.scopes).toEqual(['work.projects']);
    });

    it('is case-insensitive for phrase matching', () => {
      const result = negotiate(negotiator, { message: 'AT WORK right now' });
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('is case-insensitive for keyword matching', () => {
      const result = negotiate(negotiator, { message: 'JOURNAL entries' });
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('does not partial-match keywords (e.g. "the" should not match "therapy")', () => {
      const result = negotiate(negotiator, {
        message: 'the weather is nice',
        currentScopes: ['work.projects'],
      });
      // "the" should not match "therapy" due to word boundary
      expect(result.changed).toBe(false);
    });

    it('getChannelDefaults returns all non-secret for shell', () => {
      const defaults = negotiator.getChannelDefaults('shell', KNOWN_SCOPES);
      expect(defaults.length).toBeGreaterThan(0);
      expect(defaults.every((s) => !s.includes('secret'))).toBe(true);
    });

    it('getChannelDefaults returns personal for moltbot', () => {
      const defaults = negotiator.getChannelDefaults('moltbot', KNOWN_SCOPES);
      expect(defaults.every((s) => s.startsWith('personal.'))).toBe(true);
      expect(defaults.every((s) => !s.includes('secret'))).toBe(true);
    });

    it('getChannelDefaults returns work for mcp', () => {
      const defaults = negotiator.getChannelDefaults('mcp', KNOWN_SCOPES);
      expect(defaults.every((s) => s.startsWith('work.'))).toBe(true);
      expect(defaults.every((s) => !s.includes('secret'))).toBe(true);
    });
  });
});
