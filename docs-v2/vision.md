# POPS — Vision, Mission & Strategy

## Vision

A single self-hosted platform that manages every operational aspect of my life — finances, home, food, entertainment, travel — making daily life easier, better integrated, and less manual.

## Mission

Own my data. Keep it safe. Automate the tedious. Surface insights I'd never find manually. No subscriptions, no vendor lock-in, minimal cloud dependency (backups excepted).

## Strategy

Build modular apps on a shared foundation: one database, one API, one shell. Ship the most-used apps first. Connect domains through shared entities and an AI layer.

The system should do more for me than I do for it. Every app must return more value than the effort it takes to feed it. Automate aggressively — proactive suggestions, automatic categorisation, cross-domain insights — so the platform improves my life before I even open it.

Optimise for one user operating from a phone or a wall-mounted tablet.

## Design Principles

These follow from the strategy and should guide every PRD and technical decision:

1. **Output > Input** — If an app requires more data entry than value it returns, it has failed. Prefer automation, imports, and inference over manual input.
2. **Connected by default** — Apps share entities, link records across domains, and surface cross-domain insights. Isolated apps are just worse versions of existing products.
3. **Self-hosted, self-owned** — Data lives on hardware I control. Cloud services are tools (backups, AI APIs), not dependencies.
4. **Proactive, not reactive** — The system should surface what matters before I ask. Budget alerts, expiring warranties, meal suggestions from what's in stock, upcoming trip prep.
5. **One interface** — Phone, tablet, wall mount — same app, responsive, fast. No context switching between separate tools.
6. **Simple until proven otherwise** — One SQLite database, one API, one shell. Split only when there's a concrete reason, not in anticipation of scale that may never come.
