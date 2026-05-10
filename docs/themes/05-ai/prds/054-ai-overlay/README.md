# PRD-054: AI Overlay

> Epic: [01 — AI Overlay](../../epics/01-ai-overlay.md)
> Status: Superseded by [PRD-087 — Ego Core](../../../06-cerebrum/prds/087-ego-core/README.md)

## Overview

The conversational AI overlay surface is owned by [PRD-087 — Ego Core](../../../06-cerebrum/prds/087-ego-core/README.md). This PRD originally proposed a verb-registry command language (`<domain>:<verb> { params }`) with lazy tool loading and a flat permission system. That approach was set aside in favour of an LLM-driven agent grounded in Cerebrum retrieval (engrams, scope model, query engine) — see PRD-087 for the architecture, [PRD-088](../../../06-cerebrum/prds/088-ego-channels/README.md) for the channel adapters (MCP, Moltbot, CLI), and [PRD-099](../../../01-foundation/prds/099-overlay-surfaces/README.md) for the dual-surface mounting.

The AI-callable tool surface across modules is consolidated under [PRD-101 — Plugin Contract US-10](../../../01-foundation/prds/101-plugin-contract/us-10-ai-tool-aggregation.md), which defines how every module declares its tools via the manifest contract and how Ego enumerates them.

User stories under this PRD are not implemented and will not ship in their original form.
