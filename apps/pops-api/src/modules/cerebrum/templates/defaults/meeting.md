---
name: meeting
description: A meeting record — attendees, agenda, outcomes, follow-ups
required_fields: []
suggested_sections:
  - Attendees
  - Agenda
  - Notes
  - Decisions
  - Follow-ups
default_scopes: []
custom_fields:
  project:
    type: string
    description: 'Project the meeting belongs to'
  attendees:
    type: string[]
    description: 'People in the room'
---

# {{title}}

## Attendees

{{attendees}}

## Agenda

{{What was discussed}}

## Notes

{{Key points raised}}

## Decisions

{{What was decided}}

## Follow-ups

{{Who owns what, by when}}
