import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tagVocabulary, transactionTagRules } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { setupTestContext } from '../../../shared/test-utils.js';

const ctx = setupTestContext();

describe('tagRules', () => {
  let caller: ReturnType<typeof ctx.setup>['caller'];

  beforeEach(() => {
    const result = ctx.setup();
    caller = result.caller;
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('lists seeded vocabulary tags', async () => {
    // The schema initializer seeds tag vocabulary for new databases.
    const res = await caller.core.tagRules.listVocabulary();
    expect(res.tags.length).toBeGreaterThan(0);
    expect(res.tags).toContain('Groceries');
  });

  it('proposes a ChangeSet and returns deterministic preview with New tags marked', async () => {
    // Ensure vocabulary has a known tag but not the new one.
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const res = await caller.core.tagRules.proposeTagRuleChangeSet({
      signal: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries', 'BrandNewTag'],
      },
      transactions: [
        { transactionId: 't1', description: 'WOOLWORTHS 1234' },
        { transactionId: 't2', description: 'OTHER 1' },
      ],
      maxPreviewItems: 200,
    });

    expect(res.changeSet.ops).toHaveLength(1);
    expect(res.preview.counts.affected).toBe(1);
    const affected = res.preview.affected[0]!;
    expect(affected.transactionId).toBe('t1');
    expect(
      affected.after.suggestedTags.some((t) => t.tag === 'Groceries' && t.isNew === false)
    ).toBe(true);
    expect(
      affected.after.suggestedTags.some((t) => t.tag === 'BrandNewTag' && t.isNew === true)
    ).toBe(true);
  });

  it('regex matching is case-insensitive', async () => {
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const res = await caller.core.tagRules.previewTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'woolworths',
              matchType: 'regex',
              tags: ['Groceries'],
            },
          },
        ],
      },
      transactions: [{ transactionId: 't1', description: 'WOOLWORTHS 1234' }],
      maxPreviewItems: 50,
    });

    expect(res.counts.affected).toBe(1);
  });

  it('exact matching works', async () => {
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const res = await caller.core.tagRules.previewTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'WOOLWORTHS 1234',
              matchType: 'exact',
              tags: ['Groceries'],
            },
          },
        ],
      },
      transactions: [{ transactionId: 't1', description: 'WOOLWORTHS 1234' }],
      maxPreviewItems: 50,
    });

    expect(res.counts.affected).toBe(1);
  });

  it('entityId scoping is enforced (rule only applies when entity matches)', async () => {
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const res = await caller.core.tagRules.previewTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'WOOLWORTHS',
              matchType: 'contains',
              entityId: 'entity-a',
              tags: ['Groceries'],
            },
          },
        ],
      },
      transactions: [
        { transactionId: 't1', description: 'WOOLWORTHS 1234', entityId: 'entity-a' },
        { transactionId: 't2', description: 'WOOLWORTHS 9999', entityId: 'entity-b' },
      ],
      maxPreviewItems: 50,
    });

    expect(res.counts.affected).toBe(1);
    expect(res.affected[0]!.transactionId).toBe('t1');
  });

  it('preview ignores transactions with userTags set (never overwrites user-entered tags)', async () => {
    const res = await caller.core.tagRules.previewTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: ['Groceries'] },
          },
        ],
      },
      transactions: [
        { transactionId: 't1', description: 'WOOLWORTHS 1234', userTags: ['Manual'] },
        { transactionId: 't2', description: 'WOOLWORTHS 9999' },
      ],
      maxPreviewItems: 50,
    });

    expect(res.counts.affected).toBe(1);
    expect(res.affected[0]!.transactionId).toBe('t2');
  });

  it('apply persists accepted New tags into vocabulary and inserts tag rule rows', async () => {
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.delete(transactionTagRules).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const changeSet = {
      ops: [
        {
          op: 'add' as const,
          data: {
            descriptionPattern: 'WOOLWORTHS',
            matchType: 'contains' as const,
            tags: ['Groceries', 'BrandNewTag'],
            confidence: 0.95,
            isActive: true,
          },
        },
      ],
    };

    const res = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet,
      acceptedNewTags: ['BrandNewTag'],
    });

    expect(res.rules.length).toBe(1);
    const vocab = orm.select({ tag: tagVocabulary.tag }).from(tagVocabulary).all();
    expect(vocab.map((v) => v.tag)).toContain('BrandNewTag');
  });

  it('apply supports edit/disable/remove ops and returns NOT_FOUND for missing ids', async () => {
    const addRes = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'A', matchType: 'contains', tags: ['Groceries'] },
          },
        ],
      },
      acceptedNewTags: [],
    });
    const ruleId = addRes.rules[0]!.id;

    // Edit: clear entityId explicitly
    const editRes = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet: { ops: [{ op: 'edit', id: ruleId, data: { entityId: null } }] },
      acceptedNewTags: [],
    });
    expect(editRes.rules.find((r) => r.id === ruleId)?.entityId).toBeNull();

    // Disable
    const disableRes = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet: { ops: [{ op: 'disable', id: ruleId }] },
      acceptedNewTags: [],
    });
    expect(disableRes.rules.find((r) => r.id === ruleId)?.isActive).toBe(false);

    // Remove
    const removeRes = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet: { ops: [{ op: 'remove', id: ruleId }] },
      acceptedNewTags: [],
    });
    expect(removeRes.rules.find((r) => r.id === ruleId)).toBeUndefined();

    await expect(
      caller.core.tagRules.applyTagRuleChangeSet({
        changeSet: { ops: [{ op: 'disable', id: 'missing-id' }] },
        acceptedNewTags: [],
      })
    ).rejects.toThrow();
  });

  it('reject requires feedback and applies no changes', async () => {
    const orm = getDrizzle();
    orm.delete(transactionTagRules).run();

    await expect(
      caller.core.tagRules.rejectTagRuleChangeSet({
        changeSet: {
          ops: [
            {
              op: 'add',
              data: { descriptionPattern: 'X', matchType: 'contains', tags: ['Groceries'] },
            },
          ],
        },
        feedback: '',
      })
    ).rejects.toThrow();

    const rules = orm.select().from(transactionTagRules).all();
    expect(rules.length).toBe(0);
  });

  it('reject without signal returns no followUpProposal and applies no changes', async () => {
    const orm = getDrizzle();
    orm.delete(transactionTagRules).run();

    const res = await caller.core.tagRules.rejectTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'NETFLIX', matchType: 'contains', tags: ['Subscriptions'] },
          },
        ],
      },
      feedback: 'Too broad a pattern',
    });

    expect(res.message).toBe('Tag rule ChangeSet rejected');
    expect(res.followUpProposal).toBeNull();

    // No rules must have been written.
    const rules = orm.select().from(transactionTagRules).all();
    expect(rules.length).toBe(0);
  });

  it('reject with signal and feedback returns a followUpProposal incorporating the feedback', async () => {
    const orm = getDrizzle();
    orm.delete(transactionTagRules).run();
    orm.delete(tagVocabulary).run();
    orm
      .insert(tagVocabulary)
      .values({ tag: 'Subscriptions', source: 'seed', isActive: true })
      .run();

    const res = await caller.core.tagRules.rejectTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'NETFLIX', matchType: 'contains', tags: ['Subscriptions'] },
          },
        ],
      },
      feedback: 'Use exact match instead',
      signal: {
        descriptionPattern: 'NETFLIX',
        matchType: 'exact',
        tags: ['Subscriptions'],
      },
      transactions: [
        { transactionId: 't1', description: 'NETFLIX' },
        { transactionId: 't2', description: 'NETFLIX HD' },
      ],
      maxPreviewItems: 200,
    });

    expect(res.message).toBe('Tag rule ChangeSet rejected');
    expect(res.followUpProposal).toBeDefined();

    const followUp = res.followUpProposal!;

    // Rationale must reference the feedback.
    expect(followUp.rationale).toContain('Use exact match instead');

    // The ChangeSet reason must reference the feedback.
    expect(followUp.changeSet.reason).toContain('Use exact match instead');

    // The follow-up proposal uses the revised signal (exact match).
    const addOp = followUp.changeSet.ops[0];
    expect(addOp?.op).toBe('add');
    if (addOp?.op === 'add') {
      expect(addOp.data.matchType).toBe('exact');
      expect(addOp.data.descriptionPattern).toBe('NETFLIX');
    }

    // No rules were applied — rejection must not persist anything.
    const rules = orm.select().from(transactionTagRules).all();
    expect(rules.length).toBe(0);
  });

  it('reject with signal returns correct preview for the follow-up', async () => {
    const orm = getDrizzle();
    orm.delete(transactionTagRules).run();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: 'Groceries', source: 'seed', isActive: true }).run();

    const res = await caller.core.tagRules.rejectTagRuleChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'SHOP', matchType: 'contains', tags: ['Groceries'] },
          },
        ],
      },
      feedback: 'Too vague — scope to WOOLWORTHS only',
      signal: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      },
      transactions: [
        { transactionId: 't1', description: 'WOOLWORTHS 1234' },
        { transactionId: 't2', description: 'COLES 9999' },
      ],
      maxPreviewItems: 200,
    });

    expect(res.followUpProposal).toBeDefined();
    const followUp = res.followUpProposal!;

    // Only WOOLWORTHS 1234 should be in the preview.
    expect(followUp.preview.counts.affected).toBe(1);
    expect(followUp.preview.affected[0]?.transactionId).toBe('t1');
  });
});
