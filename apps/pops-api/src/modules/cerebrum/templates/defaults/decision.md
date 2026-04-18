---
name: decision
description: A decision made with rationale and outcome tracking
required_fields:
  - decision
  - alternatives
suggested_sections:
  - Context
  - Decision
  - Alternatives
  - Rationale
  - Outcome
default_scopes: []
custom_fields:
  decision:
    type: string
    description: 'The decision that was made'
  alternatives:
    type: string[]
    description: 'Options that were considered'
  outcome:
    type: string
    description: 'Result of the decision'
  confidence:
    type: string
    description: 'low | medium | high'
---

# {{title}}

## Context

{{Why this decision needed to be made}}

## Decision

{{decision}}

## Alternatives

{{alternatives}}

## Rationale

{{Why this option was chosen}}

## Outcome

_To be filled in after the decision plays out._
