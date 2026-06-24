import { describe, expect, expectTypeOf, it } from 'vitest';

import { ListsErrorSchema } from '../errors.js';
import { AgendaItemSchema } from '../schemas/agenda-item.js';
import { ListItemSchema } from '../schemas/list-item.js';
import { ProjectSchema } from '../schemas/project.js';
import { TagSchema } from '../schemas/tag.js';

import type { z } from 'zod';

import type { ListsError } from '../errors.js';
import type { AgendaItem } from '../types/agenda-item.js';
import type { ListItem } from '../types/list-item.js';
import type { Project } from '../types/project.js';
import type { Tag } from '../types/tag.js';

describe('@pops/lists contract round-trip', () => {
  it('ListItem ↔ ListItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ListItemSchema>>().toEqualTypeOf<ListItem>();
  });

  it('Project ↔ ProjectSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ProjectSchema>>().toEqualTypeOf<Project>();
  });

  it('Tag ↔ TagSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof TagSchema>>().toEqualTypeOf<Tag>();
  });

  it('AgendaItem ↔ AgendaItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof AgendaItemSchema>>().toEqualTypeOf<AgendaItem>();
  });

  it('ListsError ↔ ListsErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ListsErrorSchema>>().toEqualTypeOf<ListsError>();
  });

  it('ListItemSchema accepts a well-formed payload', () => {
    const payload: ListItem = {
      id: 'li_1',
      name: 'Buy milk',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ListItemSchema.parse(payload)).toEqual(payload);
  });

  it('ListItemSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: ListItem = {
      id: 'li_1',
      name: 'x',
      completed: false,
      lastEditedTime: '12 June 2026',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a missing name', () => {
    const bad = {
      id: 'li_1',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a non-boolean completed', () => {
    const bad = {
      id: 'li_1',
      name: 'x',
      completed: 'yes',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      name: 'x',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ProjectSchema accepts a well-formed active payload', () => {
    const payload: Project = {
      id: 'prj_1',
      name: 'Kitchen renovation',
      status: 'active',
      description: 'Refit cabinets and replace splashback.',
      parentId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ProjectSchema.parse(payload)).toEqual(payload);
  });

  it('ProjectSchema accepts a nested child project with null description', () => {
    const payload: Project = {
      id: 'prj_2',
      name: 'Cabinets',
      status: 'planned',
      description: null,
      parentId: 'prj_1',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ProjectSchema.parse(payload)).toEqual(payload);
  });

  it('ProjectSchema rejects an unknown status', () => {
    const bad = {
      id: 'prj_1',
      name: 'x',
      status: 'wip',
      description: null,
      parentId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ProjectSchema.parse(bad)).toThrow();
  });

  it('ProjectSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'prj_1',
      name: 'x',
      status: 'active',
      description: null,
      parentId: null,
      lastEditedTime: 'yesterday',
    };

    expect(() => ProjectSchema.parse(bad)).toThrow();
  });

  it('TagSchema accepts a well-formed payload with a colour', () => {
    const payload: Tag = {
      id: 'tag_1',
      name: 'Errands',
      color: '#FFAA00',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(TagSchema.parse(payload)).toEqual(payload);
  });

  it('TagSchema accepts a payload with a null colour', () => {
    const payload: Tag = {
      id: 'tag_2',
      name: 'Reading',
      color: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(TagSchema.parse(payload)).toEqual(payload);
  });

  it('TagSchema rejects a missing name', () => {
    const bad = {
      id: 'tag_1',
      color: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TagSchema.parse(bad)).toThrow();
  });

  it('TagSchema rejects a non-string colour', () => {
    const bad = {
      id: 'tag_1',
      name: 'x',
      color: 0xffaa00,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TagSchema.parse(bad)).toThrow();
  });

  it('AgendaItemSchema accepts a well-formed scheduled payload', () => {
    const payload: AgendaItem = {
      id: 'ag_1',
      title: 'Team standup',
      scheduledDate: '2026-06-12',
      status: 'scheduled',
      notes: 'Prep blockers list before joining.',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(AgendaItemSchema.parse(payload)).toEqual(payload);
  });

  it('AgendaItemSchema accepts a completed payload with null notes', () => {
    const payload: AgendaItem = {
      id: 'ag_2',
      title: 'Dentist',
      scheduledDate: '2026-06-10',
      status: 'completed',
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(AgendaItemSchema.parse(payload)).toEqual(payload);
  });

  it('AgendaItemSchema rejects a datetime in scheduledDate (date-only required)', () => {
    const bad = {
      id: 'ag_1',
      title: 'x',
      scheduledDate: '2026-06-12T00:00:00.000Z',
      status: 'scheduled',
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => AgendaItemSchema.parse(bad)).toThrow();
  });

  it('AgendaItemSchema rejects an unknown status', () => {
    const bad = {
      id: 'ag_1',
      title: 'x',
      scheduledDate: '2026-06-12',
      status: 'pending',
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => AgendaItemSchema.parse(bad)).toThrow();
  });

  it('AgendaItemSchema rejects a non-string title', () => {
    const bad = {
      id: 'ag_1',
      title: 42,
      scheduledDate: '2026-06-12',
      status: 'scheduled',
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => AgendaItemSchema.parse(bad)).toThrow();
  });

  it('ListsErrorSchema accepts ContractStatus envelope', () => {
    expect(ListsErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('ListsErrorSchema accepts an unknown-list-item domain error', () => {
    const err: ListsError = { kind: 'unknown-list-item', listItemId: 'li_1' };
    expect(ListsErrorSchema.parse(err)).toEqual(err);
  });

  it('ListsErrorSchema accepts a list-item-archived domain error', () => {
    const err: ListsError = { kind: 'list-item-archived', listItemId: 'li_1' };
    expect(ListsErrorSchema.parse(err)).toEqual(err);
  });

  it('ListsErrorSchema rejects an unknown kind', () => {
    expect(() => ListsErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
